"""Exactly two TRAIN fits, validation-only decisions, then one selected TEST prediction."""

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import logging
from pathlib import Path
from time import perf_counter
import warnings

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.exceptions import ConvergenceWarning
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits

from ..contracts import FEATURE_NAMES, stable_json
from .contracts import FrozenSelection, TrainingConfig
from .data import FrozenSource, SplitData
from .metrics import customer_diagnostics, metrics, ranking, reliability, select_threshold, temporal, top_decile

logger = logging.getLogger(__name__)
FAMILIES = ("logistic_regression", "hist_gradient_boosting")


def write_json(path: Path, value: dict):
    with path.open("xb") as handle:
        handle.write(stable_json(value))


def ids_hash(ids) -> str:
    return hashlib.sha256("".join(key+"\n" for key in ids).encode()).hexdigest()


def make_candidates(config: TrainingConfig) -> dict:
    policy = config.policy
    return {
        "logistic_regression": Pipeline([
            ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
            ("scaler", StandardScaler()),
            ("classifier", LogisticRegression(**policy["logistic_regression"])),
        ]),
        "hist_gradient_boosting": HistGradientBoostingClassifier(**policy["hist_gradient_boosting"]),
    }


@dataclass(frozen=True)
class Comparison:
    models: dict
    predictions: dict
    fit_seconds: dict
    fit_audit: dict


def fit_candidates(train: SplitData, validation: SplitData, config: TrainingConfig) -> Comparison:
    if train.partition != "train" or validation.partition != "validation" or set(train.ids)&set(validation.ids):
        raise ValueError("Only disjoint TRAIN and VALIDATION inputs are accepted for comparison")
    if any(len(np.unique(s.y)) != 2 for s in (train, validation)):
        raise ValueError("Both training and validation require both target classes")
    models, predictions, times = make_candidates(config), {}, {}
    with threadpool_limits(limits=config.thread_limit):
        for family, model in models.items():
            started = perf_counter()
            with warnings.catch_warnings():
                warnings.simplefilter("error", ConvergenceWarning)
                model.fit(train.X, train.y)
            times[family] = perf_counter()-started
            predictions[family] = {
                "train": model.predict_proba(train.X)[:,1],
                "validation": model.predict_proba(validation.X)[:,1],
            }
            logger.info("Fitted %s once on %d TRAIN rows in %.3fs", family, len(train.ids), times[family])
    fit_audit = dict(fit_partition="train", fit_rows=len(train.ids), fit_ids_sha256=ids_hash(train.ids),
                     validation_ids_sha256=ids_hash(validation.ids), estimator_fit_calls={f:1 for f in FAMILIES},
                     preprocessing_fit_partition="train", estimator_input_columns=list(FEATURE_NAMES),
                     estimator_input_width=train.X.shape[1], test_supplied_to_comparison=False,
                     resampling=False, early_stopping=False, posthoc_calibration_fit=False)
    return Comparison(models,predictions,times,fit_audit)


def select_family(validation_metrics: dict, config: TrainingConfig) -> tuple[str,str]:
    if set(validation_metrics) != set(FAMILIES):
        raise ValueError("Selection requires exactly the two approved candidates")
    lr, hgb = (validation_metrics[f]["ap"] for f in FAMILIES)
    if any(v is None or not np.isfinite(v) or not 0 <= v <= 1 for v in (lr,hgb)):
        raise ValueError("Selection requires defined validation average precision")
    if abs(lr-hgb) <= config.ap_tie_tolerance:
        return FAMILIES[0], "Validation AP gap <= 0.005; prefer simpler Logistic Regression"
    family = FAMILIES[0] if lr > hgb else FAMILIES[1]
    return family, "Higher validation average precision, exceeding the predefined 0.005 practical-tie tolerance"


def preprocessing_metadata(comparison: Comparison) -> dict:
    model = comparison.models["logistic_regression"]
    return dict(feature_order=list(FEATURE_NAMES), fit_partition="train",
                logistic_regression=dict(imputer_strategy="median", add_indicator=False,
                    imputer_statistics=model.named_steps["imputer"].statistics_.tolist(),
                    scaler_mean=model.named_steps["scaler"].mean_.tolist(),
                    scaler_scale=model.named_steps["scaler"].scale_.tolist(),
                    scaler_samples_seen=int(model.named_steps["scaler"].n_samples_seen_)),
                hist_gradient_boosting=dict(missing_handling="native NaN", fitted_imputer=False, fitted_scaler=False),
                nullable_feature="days_since_last_cart_add", existing_missing_indicator="no_cart_add_60d")


def interpret(comparison, validation, config) -> dict:
    lr = comparison.models["logistic_regression"].named_steps["classifier"]
    coefficients = sorted([dict(feature=name, standardized_coefficient=float(value))
                           for name,value in zip(FEATURE_NAMES,lr.coef_[0])],
                          key=lambda r:(-abs(r["standardized_coefficient"]),r["feature"]))
    with threadpool_limits(limits=config.thread_limit):
        importance = permutation_importance(comparison.models["hist_gradient_boosting"],
            validation.X,validation.y,scoring="average_precision",n_repeats=config.permutation_repeats,
            random_state=config.seed,n_jobs=1)
    permutation = sorted([dict(feature=name, mean_ap_decrease=float(mean), std=float(std))
                          for name,mean,std in zip(FEATURE_NAMES,importance.importances_mean,importance.importances_std)],
                         key=lambda r:(-r["mean_ap_decrease"],r["feature"]))
    return dict(logistic_standardized_coefficients=coefficients, logistic_intercept=float(lr.intercept_[0]),
                hgb_validation_permutation=permutation, permutation_repeats=config.permutation_repeats,
                notice="Synthetic associations only, not causality. Correlated/nested features redistribute coefficients and permutation importance; permutations may create implausible combinations.")


def shortcut_check(validation, selected_p, baseline_p) -> dict:
    directions = {"purchase_count_60d":1,"purchase_recency_days":-1,"session_count_60d":1,"cart_add_count_60d":1}
    single = {name:dict(direction=direction, **ranking(validation.y, direction*validation.X[:,FEATURE_NAMES.index(name)]))
              for name,direction in directions.items()}
    selected, reference = metrics(validation.y,selected_p), metrics(validation.y,baseline_p)
    return dict(scope="validation only; four predefined raw rankings, no additional fitted models",
                single_feature_rankings=single, selected_ap=selected["ap"], constant_ap=reference["ap"],
                near_perfect_flag=selected["ap"] >= .95 or any(v["ap"] is not None and v["ap"] >= .95 for v in single.values()),
                diagnostic_flag_rule="AP >= 0.95; reporting flag only, never a tuning trigger",
                notice="Strong ranking may reflect programmed behavioral relationships. Absence of near-perfect scores does not establish real-world generalization.")


def evaluate_split(split, p, threshold) -> dict:
    time_report = temporal(split.y,p,split.ids,split.mondays)
    return dict(**metrics(split.y,p,threshold), top_decile=time_report["top_decile"],
                pooled_top_decile=top_decile(split.y,p,split.ids), temporal=time_report,
                calibration=reliability(split.y,p), customer_diagnostics=customer_diagnostics(split,p,threshold))


def run_training(source: FrozenSource, output_dir: Path, config: TrainingConfig | None = None) -> dict:
    from .bundle import save_bundle
    config = config or TrainingConfig()
    output_dir = Path(output_dir)
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError("Refusing an existing/partial experiment directory; no silent test rerun")
    output_dir.mkdir(parents=True,exist_ok=True)
    write_json(output_dir/"training_config.json",config.policy)
    started = perf_counter()
    train, validation = source.read("train"), source.read("validation")
    comparison = fit_candidates(train,validation,config)
    before_selection = perf_counter()
    validation_metrics = {f:metrics(validation.y,comparison.predictions[f]["validation"]) for f in FAMILIES}
    family, reason = select_family(validation_metrics,config)
    threshold = select_threshold(validation.y,comparison.predictions[family]["validation"],config.threshold_tie_tolerance)
    decision = FrozenSelection(family=family, source_hash_manifest_sha256=source.hash_manifest_sha256,
        training_config_sha256=config.sha256, validation_ap=validation_metrics[family]["ap"],
        technical_validation_threshold=threshold)
    # The selection and fixed calibration policy are durably recorded before test release.
    write_json(output_dir/"selection_frozen.json",dict(**decision.model_dump(),reason=reason,
               frozen_at=datetime.now(timezone.utc).isoformat()))
    candidate_metrics = {f:{s.partition:metrics(s.y,comparison.predictions[f][s.partition],threshold)
                            for s in (train,validation)} for f in FAMILIES}
    write_json(output_dir/"candidate_metrics.json",dict(candidates=candidate_metrics,
               threshold_scope="Shared technical threshold selected on the winning candidate's validation predictions",
               test_candidates_evaluated=False))
    reference_p = float(train.y.mean())
    evaluation = {s.partition:evaluate_split(s,comparison.predictions[family][s.partition],threshold) for s in (train,validation)}
    calibration_candidates = {f:reliability(validation.y,comparison.predictions[f]["validation"]) for f in FAMILIES}
    interpretation = interpret(comparison,validation,config)
    shortcut = shortcut_check(validation,comparison.predictions[family]["validation"],np.full(len(validation.y),reference_p))
    write_json(output_dir/"validation_diagnostics.json",dict(calibration_candidates=calibration_candidates,
               candidate_temporal={f:temporal(validation.y,comparison.predictions[f]["validation"],validation.ids,validation.mondays) for f in FAMILIES},
               interpretation=interpretation,synthetic_shortcuts=shortcut))
    selection_seconds = perf_counter()-before_selection
    write_json(output_dir/"test_evaluation_started.json",dict(selection_sha256=hashlib.sha256((output_dir/"selection_frozen.json").read_bytes()).hexdigest(),
               started_at=datetime.now(timezone.utc).isoformat(), policy="Exactly one selected-model test predict_proba; all test diagnostics reuse its stored probabilities"))
    test = source.open_test(decision)
    before_test = perf_counter()
    with threadpool_limits(limits=config.thread_limit):
        test_p = comparison.models[family].predict_proba(test.X)[:,1]
    evaluation["test"] = evaluate_split(test,test_p,threshold)
    baseline = {s.partition:metrics(s.y,np.full(len(s.y),reference_p)) for s in (train,validation,test)}
    evaluation["constant_reference"] = dict(probability=reference_p,competitive=False,splits=baseline)
    evaluation["metric_definitions"] = dict(ap="sklearn.metrics.average_precision_score (not trapezoidal PR area)",
        top_decile="Primary: within each Monday; pooled result also supplied",confusion_matrix="[[TN,FP],[FN,TP]]",
        undefined="null; no-positive AP and single-class ROC-AUC are undefined",uncertainty="No independent-row confidence intervals")
    timings = dict(candidate_fit_seconds=comparison.fit_seconds, selection_and_validation_diagnostics_seconds=selection_seconds,
                   test_evaluation_seconds=perf_counter()-before_test, experiment_seconds=perf_counter()-started)
    training_audit = dict(**comparison.fit_audit,selected_family=family,selection_reason=reason,
        selection_frozen_before_test=True,selected_test_predict_calls=1,other_candidate_test_predict_calls=0,
        test_refit_or_adjustments=0,threshold_partition="validation",calibration_method="none")
    anchor = save_bundle(output_dir,comparison.models[family],source,config,decision,evaluation,
                         preprocessing_metadata(comparison),training_audit,timings)
    logger.info("Saved complete %s bundle; selected TEST evaluated once",family)
    return dict(status="passed",family=family,reason=reason,threshold=threshold,bundle_hash=anchor,
                validation=candidate_metrics,test=evaluation["test"],timings=timings)
