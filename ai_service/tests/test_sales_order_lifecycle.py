"""Order-only cohorts are named and measured independently from funnel_v1."""

from datetime import timedelta
from decimal import Decimal
import ast
from pathlib import Path

import pytest

from medsense_ai.sales_analytics import AnalyticsStatus, analyze_funnel, analyze_order_lifecycle
from sales_data_fixtures import changed
from sales_funnel_fixtures import START, TICK, batch, feed, journey, request


def order_only(data):
    return changed(
        data, events=[changed(e, cart_id=None, session_id=None) for e in data.events if e.order_id],
        orders=[changed(o, cart_id=None, session_id=None) for o in data.orders],
        coverage=[c for c in data.coverage if c.stream in ("orders", "order_created", "purchase_completed", "order_cancelled", "customers")],
        manifest=changed(data.manifest, session_policy_version=None),
    )


def test_order_only_completed_cancelled_pending_are_separate_from_funnel():
    data = order_only(batch(journey("done"), journey("cancel", terminal="order_cancelled"), journey("pending", 3)))
    result = analyze_order_lifecycle(data, request())
    assert result.status == AnalyticsStatus.VALID
    assert result.report_kind == "order_lifecycle_7d"
    assert result.observed_created_orders == result.eligible_mature_orders == 3
    assert result.completed_within_followup == result.cancelled_within_followup == result.pending_at_followup_end == 1
    assert result.completion_rate.value == Decimal("0.3333333333333333333333333333")
    assert "funnel_version" not in result.model_dump()
    assert analyze_funnel(data, request()).status == AnalyticsStatus.INSUFFICIENT_COVERAGE


def test_lifecycle_uses_order_creation_horizon_not_first_view():
    # After the session's V+7d, before the order's created+7d.
    data = batch(journey("one", completion_at=START + timedelta(days=7, minutes=1)))
    assert analyze_funnel(data, request()).stages[3].stage_count == 0
    assert analyze_order_lifecycle(data, request()).completed_within_followup == 1
    assert data.events[-1].event_name == "purchase_completed"


@pytest.mark.parametrize(("offset", "completed"), [(timedelta(0), 1), (TICK, 0)])
def test_order_completion_boundary(offset, completed):
    data = order_only(batch(journey("one", completion_at=START + timedelta(days=7, minutes=2) + offset)))
    result = analyze_order_lifecycle(data, request())
    assert result.completed_within_followup == completed
    assert result.pending_at_followup_end == 1 - completed


def test_order_immaturity_is_not_pending():
    cutoff = START + timedelta(days=7)
    data = order_only(batch(journey("one"), cutoff=cutoff))
    result = analyze_order_lifecycle(data, request(knowledge_cutoff=cutoff))
    assert result.status == AnalyticsStatus.IMMATURE
    assert result.immature_orders == 1
    assert result.pending_at_followup_end is None


@pytest.mark.parametrize("stream", ["orders", "order_created", "purchase_completed", "order_cancelled"])
def test_missing_lifecycle_feed_is_not_zero(stream):
    data = feed(order_only(batch(journey("one"))), stream)
    result = analyze_order_lifecycle(data, request())
    assert result.status == AnalyticsStatus.INSUFFICIENT_COVERAGE
    assert result.unavailable_orders == 1
    assert result.completed_within_followup is None
    assert result.completion_rate.value is None


def test_empty_order_cohort_and_invalid_input_are_distinct():
    result = analyze_order_lifecycle(order_only(batch()), request())
    assert result.status == AnalyticsStatus.NOT_APPLICABLE
    assert result.completed_within_followup == 0
    assert result.completion_rate.denominator == 0 and result.completion_rate.value is None
    rejected = analyze_order_lifecycle({}, request())
    assert rejected.status == AnalyticsStatus.INVALID_INPUT
    assert rejected.observed_created_orders is None



def test_core_imports_only_canonical_records_stdlib_and_existing_typed_validation():
    import ast
    import sys
    from pathlib import Path

    root = (
        Path(__file__).resolve().parents[1]
        / "src"
        / "medsense_ai"
        / "sales_analytics"
    )

    for path in root.glob("*.py"):
        for node in ast.walk(
            ast.parse(path.read_text(encoding="utf-8"))
        ):
            if isinstance(node, ast.Import):
                imports = [alias.name for alias in node.names]

            elif isinstance(node, ast.ImportFrom):
                if node.level:
                    continue

                imports = [node.module]

            else:
                continue

            for name in imports:
                allowed_prefixes = (
                    "medsense_ai.sales_data",
                    "medsense_ai.lead_scoring.model.contracts",
                )

                allowed_roots = (
                    sys.stdlib_module_names
                    | {"pydantic"}
                )

                # live.py is the explicit DB persistence adapter.
                # Keep SQLAlchemy/database dependencies isolated here.
                if path.name == "live.py":
                    allowed_prefixes = (
                        *allowed_prefixes,
                        "medsense_ai.database",
                    )

                    allowed_roots = (
                        allowed_roots
                        | {"sqlalchemy"}
                    )

                assert (
                    name.split(".")[0] in allowed_roots
                    or name.startswith(allowed_prefixes)
                ), (path, name)
