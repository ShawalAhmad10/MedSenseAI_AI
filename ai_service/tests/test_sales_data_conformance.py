"""Artificial source-shape independence; neither fixture models the partner backend."""

import ast
from dataclasses import dataclass
from pathlib import Path
import sys

import pytest

from medsense_ai.sales_data import (
    CommerceEvent, Customer, Product, SalesDataset, validate_dataset,
)
from sales_data_fixtures import START, envelope, manifest


@pytest.fixture
def conformance_source_a():
    """Flat mapping encoding one artificial observation."""
    return {
        "user": "customer_001", "sku": "product_001", "when": "2026-06-01T00:00:00Z",
        "event_key": "view_001", "visit": "session_001", "unit": "unit", "group": "group_A",
    }


@dataclass(frozen=True)
class ArtificialProduct:
    reference: str
    sale_unit: str
    grouping: str


@dataclass(frozen=True)
class ArtificialObservation:
    identity: tuple[str, str]
    product: ArtificialProduct
    timing: dict[str, str]
    correlation: dict[str, str]


@pytest.fixture
def conformance_source_b():
    """Nested typed object encoding that same fact, not a second customer/source."""
    return ArtificialObservation(
        identity=("customer", "customer_001"),
        product=ArtificialProduct("product_001", "unit", "group_A"),
        timing={"occurred": "2026-06-01T05:00:00+05:00"},
        correlation={"event": "view_001", "session": "session_001"},
    )


def map_conformance_source_a(source):
    return SalesDataset(
        manifest=manifest(),
        customers=(Customer(**envelope(source["user"]), customer_id=source["user"], first_seen_at=START),),
        products=(Product(**envelope(source["sku"]), product_id=source["sku"], selling_unit=source["unit"], merchandising_group=source["group"]),),
        events=(CommerceEvent(
            **envelope(source["event_key"], source["when"]), event_id=source["event_key"],
            event_name="product_viewed", occurred_at=source["when"], customer_id=source["user"],
            session_id=source["visit"], product_id=source["sku"],
        ),),
    )


def map_conformance_source_b(source):
    return SalesDataset(
        manifest=manifest(),
        customers=(Customer(
            dataset_id="dataset_001", source_record_ref=source.identity[1], available_at=START,
            customer_id=source.identity[1], first_seen_at=START,
        ),),
        products=(Product(
            dataset_id="dataset_001", source_record_ref=source.product.reference, available_at=START,
            product_id=source.product.reference, selling_unit=source.product.sale_unit,
            merchandising_group=source.product.grouping,
        ),),
        events=(CommerceEvent(
            dataset_id="dataset_001", source_record_ref=source.correlation["event"],
            available_at=source.timing["occurred"], event_id=source.correlation["event"],
            event_name="product_viewed", occurred_at=source.timing["occurred"],
            customer_id=source.identity[1], session_id=source.correlation["session"],
            product_id=source.product.reference,
        ),),
    )


def test_two_unrelated_source_shapes_converge(conformance_source_a, conformance_source_b):
    first = validate_dataset(map_conformance_source_a(conformance_source_a))
    second = validate_dataset(map_conformance_source_b(conformance_source_b))
    assert first.is_valid and second.is_valid
    assert first.validated_dataset == second.validated_dataset
    assert first.validated_dataset.model_dump_json() == second.validated_dataset.model_dump_json()


def test_native_shape_is_not_accepted_as_canonical(conformance_source_a):
    report = validate_dataset(conformance_source_a)
    assert not report.is_valid
    assert report.validated_dataset is None


def test_sales_core_dependency_boundary():
    root = Path(__file__).resolve().parents[1] / "src" / "medsense_ai" / "sales_data"
    local_modules = {path.stem for path in root.glob("*.py")}
    for path in root.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.level:
                assert node.level == 1 and node.module in local_modules, (path, node.module)
            elif isinstance(node, (ast.Import, ast.ImportFrom)):
                modules = [alias.name for alias in node.names] if isinstance(node, ast.Import) else [node.module]
                assert all(module.split(".")[0] in sys.stdlib_module_names | {"pydantic"} for module in modules), (path, modules)
