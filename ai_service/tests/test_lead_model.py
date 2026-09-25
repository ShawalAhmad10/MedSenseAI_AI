"""Model decisions, isolated preprocessing, protected artifacts and local runtime."""

import ast
import json
from pathlib import Path

import numpy as np
import pytest
from pydantic import ValidationError

from medsense_ai.lead_scoring.contracts import FEATURE_NAMES, stable_json
from medsense_ai.lead_scoring.features import LeadIndex
from medsense_ai.lead_scoring.io import sha256
from medsense_ai.lead_scoring.model.bundle import BundleError, load_bundle
from medsense_ai.lead_scoring.model.contracts import FrozenSelection, ScoringInput, TrainingConfig
from medsense_ai.lead_scoring.model.data import FrozenSource
from medsense_ai.lead_scoring.model.inference import score_canonical, score_features, score_local
from medsense_ai.lead_scoring.model.metrics import metrics, reliability, select_threshold, temporal, top_decile
from medsense_ai.lead_scoring.model.training import FAMILIES, fit_candidates, run_training, select_family
from lead_model_fixtures import feature, frozen_source
from lead_dataset_fixtures import T, accepted, changed, dataset


@pytest.fixture
def source(tmp_path):
    return frozen_source(tmp_path/"source")


@pytest.fixture(scope="module")
def experiment(tmp_path_factory):
    root=tmp_path_factory.mktemp("lead_model_experiment")
    source=frozen_source(root/"source")
    output=root/"bundle"
    result=run_training(source,output)
    return source,output,result


def test_source_exact_allowlist_split_and_hash_guard(source):
    train=source.read("train")
    assert train.X.shape==(80,28) and not train.X.flags.writeable
    assert source.feature_manifest["feature_allowlist"]==list(FEATURE_NAMES)
    with pytest.raises(ValueError,match="frozen"):
        source.read("test")
    with (source.data_dir/"train_ids.txt").open("a") as handle:
        handle.write("unexpected\n")
    with pytest.raises(ValueError,match="hash drift"):
        source.read("train")


@pytest.mark.parametrize("fault",["missing","extra","order"])
def test_unapproved_feature_csv_headers_rejected_even_when_hashes_reissued(source,fault):
    path=source.data_dir/"feature_matrix.csv"
    lines=path.read_text().splitlines()
    columns=lines[0].split(",")
    if fault=="missing": columns.pop()
    elif fault=="extra": columns.append("customer_id")
    else: columns[1],columns[2]=columns[2],columns[1]
    path.write_text(",".join(columns)+"\n"+"\n".join(lines[1:])+"\n")
    manifest_path=source.artifacts_dir/"file_hashes.json"
    values=json.loads(manifest_path.read_text())
    values["sha256"]["data/feature_matrix.csv"]=sha256(path)
    manifest_path.write_bytes(stable_json(values))
    with pytest.raises(ValueError,match="allowlist"):
        FrozenSource(source.data_dir,source.artifacts_dir,sha256(manifest_path))


def test_drifted_source_manifest_is_rejected(source):
    with pytest.raises(ValueError,match="trusted checkpoint"):
        FrozenSource(source.data_dir,source.artifacts_dir,"0"*64)


def test_reassigned_split_rejected_even_when_file_hashes_reissued(source):
    train=source.data_dir/"train_ids.txt"
    val=source.data_dir/"validation_ids.txt"
    a,b=train.read_text().splitlines(),val.read_text().splitlines()
    a[0],b[0]=b[0],a[0]
    train.write_text("\n".join(a)+"\n")
    val.write_text("\n".join(b)+"\n")
    path=source.artifacts_dir/"file_hashes.json"
    payload=json.loads(path.read_text())
    for p in (train,val): payload["sha256"]["data/"+p.name]=sha256(p)
    path.write_bytes(stable_json(payload))
    with pytest.raises(ValueError,match="drift"):
        FrozenSource(source.data_dir,source.artifacts_dir,sha256(path))


def test_two_deterministic_fits_and_train_only_preprocessing(source):
    train,val=source.read("train"),source.read("validation")
    first=fit_candidates(train,val,TrainingConfig())
    second=fit_candidates(train,val,TrainingConfig())
    assert set(first.models)==set(FAMILIES)
    assert first.fit_audit["estimator_fit_calls"]==dict.fromkeys(FAMILIES,1)
    assert first.fit_audit["estimator_input_columns"]==list(FEATURE_NAMES)
    lr=first.models["logistic_regression"]
    expected=np.nanmedian(train.X,axis=0)
    np.testing.assert_allclose(lr.named_steps["imputer"].statistics_,expected)
    imputed=np.where(np.isnan(train.X),expected,train.X)
    np.testing.assert_allclose(lr.named_steps["scaler"].mean_,imputed.mean(axis=0))
    assert lr.named_steps["scaler"].n_samples_seen_==len(train.ids)
    for family in FAMILIES:
        np.testing.assert_array_equal(first.predictions[family]["validation"],second.predictions[family]["validation"])
    before=lr.named_steps["imputer"].statistics_.copy()
    lr.predict_proba(val.X)
    np.testing.assert_array_equal(before,lr.named_steps["imputer"].statistics_)
    with pytest.raises(ValueError,match="TRAIN"):
        fit_candidates(val,train,TrainingConfig())


def test_ap_selection_and_predefined_simple_tie_break():
    config=TrainingConfig()
    assert select_family({FAMILIES[0]:{"ap":.7},FAMILIES[1]:{"ap":.72}},config)[0]==FAMILIES[1]
    assert select_family({FAMILIES[0]:{"ap":.7},FAMILIES[1]:{"ap":.704}},config)[0]==FAMILIES[0]
    with pytest.raises(ValueError): select_family({FAMILIES[0]:{"ap":None},FAMILIES[1]:{"ap":.7}},config)


def test_threshold_is_max_f1_with_higher_boundary_tie_break():
    y=np.asarray([1,0,0,1])
    p=np.asarray([.8,.6,.4,.2])
    # F1 at .8 and .2 is exactly 2/3; choose .8.
    threshold=select_threshold(y,p)
    assert threshold==.8
    assert metrics(y,p,threshold)["confusion_matrix"]==[[2,0],[1,1]]
    assert select_threshold(y,p)==select_threshold(y,p)
    with pytest.raises(ValueError): select_threshold([0,0],[.1,.2])


def test_metric_arithmetic_and_single_class_handling():
    m=metrics([0,1],[.2,.8],.8)
    assert m["ap"]==m["roc_auc"]==m["f1"]==m["accuracy"]==1
    assert m["brier"]==pytest.approx(.04)
    assert m["confusion_matrix"]==[[1,0],[0,1]]
    m=metrics([0,0],[.1,.1],.5)
    assert m["ap"] is None and m["roc_auc"] is None and m["recall"] is None
    assert m["f1"] is None and np.isfinite(m["log_loss"])
    with pytest.raises(ValueError): metrics([0,1],[float("nan"),.5])


def test_top_decile_ceil_ties_and_temporal_denominators():
    ids=["b","a"]+[f"x_{n}" for n in range(9)]
    y=[0,1]+[0]*9
    p=[.5]*11
    result=top_decile(y,p,ids)
    assert result["k"]==2 and result["hits"]==1 and result["precision"]==.5
    assert result["recall"]==1 and result["lift"]==5.5
    report=temporal(np.array(y),np.array(p),ids,["2026-06-01"]*5+["2026-06-08"]*6)
    assert report["top_decile"]["k"]==2
    assert report["single_class_periods"]==["2026-06-08"]
    assert report["median_ap"]==pytest.approx(.2)


def test_calibration_bins_keep_empty_bins_and_probability_endpoints():
    report=reliability([0,1],[0,1])
    assert len(report["bins"])==10 and report["bins"][0]["rows"]==report["bins"][-1]["rows"]==1
    assert report["bins"][1]["observed_fraction"] is None


def test_test_release_requires_matching_decision_and_is_once(source):
    decision=FrozenSelection(family=FAMILIES[0],source_hash_manifest_sha256=source.hash_manifest_sha256,
        training_config_sha256=TrainingConfig().sha256,validation_ap=.5,technical_validation_threshold=.5)
    assert source.open_test(decision).partition=="test"
    with pytest.raises(ValueError,match="already"):
        source.open_test(decision)


def test_experiment_freezes_before_test_and_records_no_tuning(experiment):
    source,output,result=experiment
    audit=json.loads((output/"training_audit.json").read_text())
    marker=json.loads((output/"test_evaluation_started.json").read_text())
    assert marker["selection_sha256"]==sha256(output/"selection_frozen.json")
    assert audit["selected_test_predict_calls"]==1 and audit["other_candidate_test_predict_calls"]==0
    assert audit["selection_frozen_before_test"] and audit["test_refit_or_adjustments"]==0
    assert audit["threshold_partition"]=="validation" and audit["fit_partition"]=="train"
    assert result["status"]=="passed"
    with pytest.raises(FileExistsError): run_training(source,output)


def test_bundle_roundtrip_and_inference_repeatability(experiment,monkeypatch):
    source,output,result=experiment
    bundle=load_bundle(output,result["bundle_hash"])
    validation=source.read("validation")
    restored=metrics(validation.y,bundle.model.predict_proba(validation.X)[:,1],bundle.threshold)
    assert restored==result["validation"][result["family"]]["validation"]
    request=ScoringInput(feature_version="lead_features_v1",features=feature())
    # Runtime must predict only; attempting to fit would fail this test.
    monkeypatch.setattr(bundle.model,"fit",lambda *a,**k:pytest.fail("inference attempted fitting"))
    a,b=score_features(bundle,request),score_features(bundle,request)
    assert a==b and 0<=a.model_probability<=1 and 0<=a.lead_score<=100
    assert a.lead_score==100*a.model_probability
    assert a.technical_binary_prediction==(a.model_probability>=a.technical_threshold)
    assert a.synthetic_development_notice.startswith("Synthetic-development")


@pytest.mark.parametrize("fault",["version","missing","extra","type","null","order"])
def test_inference_strict_input_failures(fault):
    request=dict(feature_version="lead_features_v1",features=feature().model_dump())
    if fault=="version": request["feature_version"]="wrong"
    elif fault=="missing": request["features"].pop("purchase_recency_days")
    elif fault=="extra": request["features"]["customer_id"]="raw"
    elif fault=="type": request["features"]["purchase_count_60d"]="3"
    elif fault=="null": request["features"]["days_since_last_cart_add"]=None
    else: request["feature_order"]=tuple(reversed(FEATURE_NAMES))
    with pytest.raises(ValidationError): ScoringInput(**request)


@pytest.mark.parametrize("fault",["missing","corrupt","feature_version","target_version","allowlist"])
def test_bad_bundle_rejected_before_deserialization(tmp_path,experiment,fault,monkeypatch):
    import shutil
    import medsense_ai.lead_scoring.model.bundle as module
    _,original,result=experiment
    directory=tmp_path/"copy"
    shutil.copytree(original,directory)
    anchor=result["bundle_hash"]
    if fault=="missing": (directory/"selected_model.joblib").unlink()
    elif fault=="corrupt": (directory/"selected_model.joblib").write_bytes(b"invalid")
    else:
        path=directory/("target_manifest.json" if fault=="target_version" else "feature_manifest.json")
        payload=json.loads(path.read_text())
        if fault=="allowlist": payload["feature_allowlist"].reverse()
        else: payload[fault]="wrong"
        path.write_bytes(stable_json(payload))
        manifest_path=directory/"bundle_hashes.json"
        manifest=json.loads(manifest_path.read_text())
        manifest["sha256"][path.name]=sha256(path)
        manifest_path.write_bytes(stable_json(manifest))
        anchor=sha256(manifest_path)
    monkeypatch.setattr(module.joblib,"load",lambda *a,**k:pytest.fail("invalid bundle deserialized"))
    with pytest.raises(BundleError): load_bundle(directory,anchor)


def test_external_bundle_pin_required_and_missing_bundle_has_no_score(experiment,tmp_path):
    _,output,result=experiment
    with pytest.raises(BundleError,match="checksum"):
        load_bundle(output,"0"*64)
    response=score_local(tmp_path,"0"*64,dict(feature_version="lead_features_v1",features=feature().model_dump()))
    assert response.status=="model_unavailable" and response.model_probability is None


def test_rejected_input_logs_do_not_expose_customer_fields(tmp_path,caplog):
    request=dict(feature_version="lead_features_v1",features={**feature().model_dump(),"customer_id":"private-customer-token"})
    response=score_local(tmp_path,"0"*64,request)
    assert response.status=="invalid_input" and response.lead_score is None
    assert "private-customer-token" not in caplog.text


def test_canonical_runtime_reuses_existing_features_and_exclusion_statuses(experiment):
    _,output,result=experiment
    bundle=load_bundle(output,result["bundle_hash"])
    assert score_canonical(LeadIndex(accepted(dataset())),"customer_1",T,bundle).status=="scored"
    out=score_canonical(LeadIndex(accepted(dataset([]))),"customer_1",T,bundle)
    assert out.status=="out_of_scope" and out.lead_score is None
    data=dataset()
    missing=changed(data,coverage=[c for c in data.coverage if c.stream!="product_viewed"])
    assert score_canonical(LeadIndex(accepted(missing)),"customer_1",T,bundle).status=="insufficient_data"
    assert score_canonical(LeadIndex(accepted(data)),"customer_1",T,None).status=="model_unavailable"
    assert score_canonical(LeadIndex(accepted(data)),"unknown",T,bundle).status=="invalid_input"


def test_model_package_has_no_hidden_generator_partner_or_search_dependencies():
    package=Path(__file__).resolve().parents[1]/"src"/"medsense_ai"/"lead_scoring"/"model"
    forbidden=("synthetic","sqlalchemy","fastapi","ddi","requests","httpx","urllib","socket","xgboost","lightgbm","shap","optuna")
    for path in package.glob("*.py"):
        for node in ast.walk(ast.parse(path.read_text())):
            imports=[n.name for n in node.names] if isinstance(node,ast.Import) else [node.module or ""] if isinstance(node,ast.ImportFrom) else []
            assert not any(word in name for name in imports for word in forbidden),path.name
            if isinstance(node,ast.Call):
                name=node.func.attr if isinstance(node.func,ast.Attribute) else node.func.id if isinstance(node.func,ast.Name) else ""
                assert name not in ("GridSearchCV","RandomizedSearchCV","train_test_split"),path.name
