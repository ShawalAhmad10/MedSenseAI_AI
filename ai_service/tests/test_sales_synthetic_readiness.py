"""Hand-calculated aggregate preview boundaries; no feature or label files."""

from datetime import datetime, timedelta, timezone
import ast
from pathlib import Path
import sys

import pytest

from medsense_ai.sales_data import CommerceEvent, Customer, DatasetManifest, Order, SalesDataset
from medsense_ai.sales_data.synthetic import profile_config, SyntheticConfig
from medsense_ai.sales_data.synthetic.cli import main
from medsense_ai.sales_data.synthetic.config import DAY, TICK
from medsense_ai.sales_data.synthetic.generator import main_coverage
from medsense_ai.sales_data.synthetic.qa import readiness_preview
from medsense_ai.sales_data.synthetic.serialization import verify_hashes

AT = datetime(2026, 6, 1, tzinfo=timezone.utc)


def preview_data(created, completed, *, late_prior=False):
    config = SyntheticConfig(start=AT - DAY * 70, end=AT + DAY * 40, customers=1, products=2)
    def envelope(key, when):
        return dict(dataset_id=config.dataset_id, source_record_ref=key, available_at=when)
    customer = Customer(**envelope("customer_1", config.start), customer_id="customer_1", first_seen_at=config.start)
    orders, events = [], []
    for key, placement, completion in (("prior", AT - DAY * 20, AT - DAY * 19), ("future", created, completed)):
        orders.append(Order(**envelope(key, placement), order_id=key, customer_id=customer.customer_id, created_at=placement))
        events.append(CommerceEvent(**envelope(key + "_created", placement), event_id=key + "_created", event_name="order_created", occurred_at=placement, customer_id=customer.customer_id, order_id=key))
        available = AT + TICK if key == "prior" and late_prior else completion
        events.append(CommerceEvent(**envelope(key + "_completed", available), event_id=key + "_completed", event_name="purchase_completed", occurred_at=completion, customer_id=customer.customer_id, order_id=key))
    manifest = DatasetManifest(dataset_id=config.dataset_id, contract_version="sales_contract_v1", source_namespace="synthetic_preview_fixture", data_origin="synthetic_development", producer_version=config.generator_version, extracted_at=config.end-TICK, source_timezone="UTC", currency_minor_units={}, completion_policy_version="artificial_completion", generation_seed=config.master_seed, generation_config_hash=config.sha256)
    data = SalesDataset(manifest=manifest, coverage=main_coverage(config), customers=(customer,), orders=tuple(orders), events=tuple(events))
    return data, config


@pytest.mark.parametrize(("created", "completed", "positive"), [
    (AT, AT + DAY, 0),
    (AT - TICK, AT + DAY, 0),
    (AT + TICK, AT + DAY * 30, 1),
    (AT + DAY * 30, AT + DAY * 30, 1),
    (AT + DAY, AT + DAY * 30 + TICK, 0),
])
def test_future_order_creation_and_completion_boundaries(created, completed, positive):
    data, config = preview_data(created, completed)
    preview = readiness_preview(data, config)
    row = next(row for row in preview["weekly"] if row["observation_time"] == AT.isoformat())
    assert row["eligible_mature"] == 1
    assert row["positives"] == positive
    assert row["negatives"] == 1 - positive


def test_late_prior_purchase_is_not_knowable_eligibility():
    data, config = preview_data(AT + DAY, AT + DAY * 2, late_prior=True)
    preview = readiness_preview(data, config)
    row = next(row for row in preview["weekly"] if row["observation_time"] == AT.isoformat())
    # The prior completion cannot qualify at T even with an overoptimistic fixture
    # watermark. Real delayed scenarios also postpone the affected coverage.
    assert row["insufficient_data"] == 1
    assert row["eligible_mature"] == 0


def test_cli_smoke_and_bad_config_have_explicit_exit_states(tmp_path, capsys):
    arguments = ["generate", "--profile", "smoke", "--output-dir", str(tmp_path / "data"), "--artifacts-dir", str(tmp_path / "artifacts")]
    assert main(arguments) == 0
    assert '"status": "passed"' in capsys.readouterr().out
    assert verify_hashes(tmp_path / "data", tmp_path / "artifacts")["data_origin"] == "synthetic_development"
    assert main([*arguments, "--seed", "-1"]) == 1


def test_synthetic_package_has_no_network_database_clinical_or_ml_dependency():
    root = Path(__file__).resolve().parents[1] / "src/medsense_ai/sales_data/synthetic"
    for path in root.glob("*.py"):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.ImportFrom) and node.level:
                continue
            if isinstance(node, ast.ImportFrom):
                names = [node.module]
            elif isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            else:
                continue
            for name in names:
                assert name.split(".")[0] in sys.stdlib_module_names | {"pydantic"} or name == "medsense_ai.sales_analytics", (path, name)
                assert name.split(".")[0] not in {"urllib", "http", "socket"}, (path, name)
