"""Canonical ingestion, model-input isolation, audit failure and reproducible exports."""

import ast
import csv
from dataclasses import replace
import json
from pathlib import Path

import pytest

from medsense_ai.lead_scoring import BuildConfig, FEATURE_NAMES, build_dataset
from medsense_ai.lead_scoring.cli import main
from medsense_ai.lead_scoring.contracts import Partition, stable_json
from medsense_ai.lead_scoring.io import (
    COLLECTIONS, load_canonical, read_features, sha256, verify_artifacts, write_artifacts,
)
from medsense_ai.lead_scoring.qa import audit_dataset, feature_manifest
from lead_dataset_fixtures import DAY, START, T, accepted, behavior, changed, dataset


def export_source(root, data):
    root.mkdir()
    (root / "manifest.json").write_bytes(stable_json(data.manifest.model_dump(mode="json")))
    for name in COLLECTIONS:
        (root / (name + ".jsonl")).write_bytes(b"".join(stable_json(r.model_dump(mode="json")) for r in getattr(data, name)))
    hashes = {"data/" + p.name: sha256(p) for p in sorted(root.iterdir())}
    provenance = root.parent / "source_hashes.json"
    provenance.write_bytes(stable_json({"sha256": hashes, "config_sha256": data.manifest.generation_config_hash}))
    # Invalid generator diagnostics deliberately cannot be parsed by this loader.
    (root / "qa_report.json").write_text("not JSON: hidden diagnostics", encoding="utf-8")
    (root / "generation_config.json").write_text("not JSON: latent generation rules", encoding="utf-8")
    return provenance


@pytest.fixture
def loaded(tmp_path):
    source = tmp_path / "source"
    hashes = export_source(source, dataset(events=(behavior("product_viewed", T-DAY, "view"),)))
    validated, provenance = load_canonical(source, hashes)
    config = BuildConfig(observation_start=T, observation_end=T+DAY)
    built = build_dataset(validated, config)
    report, leakage = audit_dataset(built, validated)
    return validated, provenance, built, report, leakage


def test_same_customer_in_all_splits_and_no_purge_rows():
    orders = [(START+DAY*n, START+DAY*(n+1), "purchase_completed") for n in range(0, 350, 25)]
    data = dataset(orders)
    # A known customer with no purchases must stay out of the matrix, not become a negative.
    data = changed(data, customers=(*data.customers, changed(data.customers[0], customer_id="never_purchased", source_record_ref="never_purchased")))
    validated = accepted(data)
    built = build_dataset(validated)
    report, leakage = audit_dataset(built, validated)
    assert report["counts"] == dict(considered=60, eligible=30, out_of_scope=30, insufficient_data=0, not_known=0, immature=0, insufficient_followup=0, supervised=30)
    assert {part: row["rows"] for part, row in report["splits"].items()} == {"train":17,"validation":4,"test":9}
    assert set(report["customer_overlap"].values()) == {1}
    assert set(built.skipped_schedule) == {"warmup", "purge_1", "purge_2", "tail"}
    assert all(e.partition in (Partition.TRAIN, Partition.VALIDATION, Partition.TEST) for e in built.examples)
    assert leakage["passed"]


def test_exports_roundtrip_and_rebuild_are_byte_identical(tmp_path, loaded):
    validated, provenance, built, report, leakage = loaded
    outputs = []
    for name, source in (("a", validated), ("b", accepted(changed(validated.validated_dataset, events=tuple(reversed(validated.validated_dataset.events)), coverage=tuple(reversed(validated.validated_dataset.coverage)))))):
        rebuilt = build_dataset(source, built.config)
        assert rebuilt.examples == built.examples
        qa, audit = audit_dataset(rebuilt, source)
        paths = (tmp_path / name / "data", tmp_path / name / "artifacts")
        hashes = write_artifacts(rebuilt, source, qa, audit, provenance, *paths)
        assert verify_artifacts(*paths)["sha256"] == hashes
        outputs.append((paths, hashes))
    assert outputs[0][1] == outputs[1][1]
    assert (outputs[0][0][1]/"file_hashes.json").read_bytes() == (outputs[1][0][1]/"file_hashes.json").read_bytes()
    data_dir, artifact_dir = outputs[0][0]
    features = read_features(data_dir / "feature_matrix.csv")
    row = built.examples[0]
    assert features == {row.example_id: row.feature_result.features}
    with (data_dir / "feature_matrix.csv").open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        assert reader.fieldnames == ["example_id", *FEATURE_NAMES]
        assert len(next(reader)) == 29
    assert row.customer_id not in (data_dir/"feature_matrix.csv").read_text()
    assert row.label_result.qualifying_order_ids[0] not in (data_dir/"feature_matrix.csv").read_text()
    audit_row = json.loads((artifact_dir/"label_audit.jsonl").read_text())
    assert audit_row["qualifying_order_ids"] == ["order_1"] and audit_row["label"] == 1
    assert audit_row["data_origin"] == "synthetic_development"
    assert report["feature_qa"]["days_since_last_cart_add"]["null_count"] == 1
    assert not provenance["generator_diagnostic_artifacts_read"]


def test_excluded_candidates_retain_audit_but_have_no_model_rows(tmp_path):
    data = dataset([])
    hashes = export_source(tmp_path/"source", data)
    validated, provenance = load_canonical(tmp_path/"source", hashes)
    built = build_dataset(validated, BuildConfig(observation_start=T, observation_end=T+DAY))
    report, audit = audit_dataset(built, validated)
    write_artifacts(built, validated, report, audit, provenance, tmp_path/"data", tmp_path/"artifacts")
    verify_artifacts(tmp_path/"data", tmp_path/"artifacts")
    assert read_features(tmp_path/"data"/"feature_matrix.csv") == {}
    audit_row = json.loads((tmp_path/"artifacts"/"label_audit.jsonl").read_text())
    assert audit_row["eligibility"] == "out_of_scope" and audit_row["label"] is None
    assert len((tmp_path/"data"/"example_index.csv").read_text().splitlines()) == 2


def test_qa_rejects_future_feature_lineage_and_false_negative(loaded):
    validated, _, built, _, _ = loaded
    row = built.examples[0]
    evidence = changed(row.feature_result.evidence, event_ids=("order_1_purchase_completed",), order_ids=("order_1",), product_ids=())
    bad = changed(row, feature_result=changed(row.feature_result, evidence=evidence))
    with pytest.raises(ValueError, match="knowable"):
        audit_dataset(replace(built, examples=(bad,)), validated)
    bad = changed(row, label_result=changed(row.label_result, label=0, qualifying_order_ids=()))
    with pytest.raises(ValueError, match="actual future source"):
        audit_dataset(replace(built, examples=(bad,)), validated)
    with pytest.raises(ValueError, match="schedule"):
        audit_dataset(replace(built, examples=(changed(row, partition=Partition.TRAIN),)), validated)
    with pytest.raises(ValueError, match="identifier"):
        audit_dataset(replace(built, examples=(changed(row, example_id="unstable_id"),)), validated)


def test_loader_detects_source_hash_drift(tmp_path):
    hashes = export_source(tmp_path/"source", dataset())
    with (tmp_path/"source"/"events.jsonl").open("ab") as handle:
        handle.write(b"\n")
    with pytest.raises(ValueError, match="source hash mismatch"):
        load_canonical(tmp_path/"source", hashes)


def test_identical_canonical_retransmission_does_not_inflate_features():
    data = dataset(events=(behavior("cart_item_added", T-DAY, "add"),))
    data = changed(data, events=(*data.events, data.events[0]))
    validated = accepted(data)
    assert validated.identical_duplicate_count == 1
    row = build_dataset(validated, BuildConfig(observation_start=T, observation_end=T+DAY)).examples[0]
    assert row.feature_result.features.cart_add_count_7d == 1


def test_writer_rejects_provenance_mismatch_and_existing_outputs(tmp_path, loaded):
    validated, provenance, built, report, audit = loaded
    args = (built, validated, report, audit)
    with pytest.raises(ValueError, match="source provenance"):
        write_artifacts(*args, {**provenance, "dataset_id":"wrong"}, tmp_path/"data", tmp_path/"artifacts")
    write_artifacts(*args, provenance, tmp_path/"data", tmp_path/"artifacts")
    with pytest.raises(FileExistsError):
        write_artifacts(*args, provenance, tmp_path/"data", tmp_path/"artifacts")
    with (tmp_path/"data"/"feature_matrix.csv").open("ab") as handle:
        handle.write(b"bad")
    with pytest.raises(ValueError, match="hash mismatch"):
        verify_artifacts(tmp_path/"data", tmp_path/"artifacts")


def test_feature_reader_rejects_unapproved_columns_and_short_rows(tmp_path):
    path = tmp_path/"features.csv"
    path.write_text(",".join(("example_id", *FEATURE_NAMES, "future_conversion_flag"))+"\n", encoding="utf-8")
    with pytest.raises(ValueError, match="allowlist"):
        read_features(path)
    path.write_text(",".join(("example_id", *FEATURE_NAMES))+"\nkey,1\n", encoding="utf-8")
    with pytest.raises(ValueError, match="malformed"):
        read_features(path)


def test_manifest_has_fixed_order_null_policy_and_source_provenance():
    manifest = feature_manifest()
    assert manifest["feature_count"] == len(FEATURE_NAMES) == 28
    assert manifest["feature_allowlist"] == [r["name"] for r in manifest["features"]] == list(FEATURE_NAMES)
    assert [r["name"] for r in manifest["features"] if r["nullable"]] == ["days_since_last_cart_add"]
    assert all(r["source_streams"] and r["boundary_semantics"] and r["description"] for r in manifest["features"])
    assert not manifest["preprocessing_fitted"]


def test_package_has_no_generator_orm_estimator_or_network_dependency():
    package = Path(__file__).resolve().parents[1]/"src"/"medsense_ai"/"lead_scoring"
    forbidden = {"synthetic", "sqlalchemy", "fastapi", "sklearn", "ddi", "requests", "httpx", "urllib", "socket"}
    for path in package.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            names = [n.name for n in node.names] if isinstance(node, ast.Import) else [node.module or ""] if isinstance(node, ast.ImportFrom) else []
            assert not any(token in name for name in names for token in forbidden), path.name
            if isinstance(node, ast.Call):
                called = node.func.attr if isinstance(node.func, ast.Attribute) else node.func.id if isinstance(node.func, ast.Name) else ""
                assert called not in {"fit", "fit_transform", "train_test_split", "eval", "exec", "__import__", "import_module"}, path.name


def test_cli_builds_canonical_export_and_reports_source_failure(tmp_path, capsys):
    hashes = export_source(tmp_path/"source", dataset())
    args = ["build", "--source-dir", str(tmp_path/"source"), "--source-hashes", str(hashes), "--output-dir", str(tmp_path/"data"), "--artifacts-dir", str(tmp_path/"artifacts"), "--observation-start", T.isoformat(), "--observation-end", (T+DAY).isoformat()]
    assert main(args) == 0
    result = json.loads(capsys.readouterr().out)
    assert result["counts"]["supervised"] == 1
    assert (tmp_path/"artifacts"/"run_metadata.json").exists()
    (tmp_path/"source"/"manifest.json").write_bytes(b"{}")
    assert main(args) == 1
