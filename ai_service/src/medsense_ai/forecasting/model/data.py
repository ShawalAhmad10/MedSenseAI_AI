"""Strictly consume the immutable FORECAST-01 export and gate TEST release."""

import csv
from dataclasses import dataclass
import json
from pathlib import Path

import numpy as np

from ..contracts import FEATURE_NAMES, FEATURE_VERSION, TARGET_VERSION
from ..io import sha256, verify_artifacts
from .contracts import FrozenSelection, SPLIT_VERSION

INDEX_COLUMNS = (
    "example_id", "dataset_id", "source_namespace", "product_id", "selling_unit",
    "observation_time", "partition", "data_origin",
)
TARGET_COLUMNS = (
    "example_id", "target_version", "target_start", "target_end", "target_completed_units",
    "target_stockout_observed", "target_stockout_seconds", "target_full_week_stockout",
    "inventory_context_status",
)


@dataclass(frozen=True)
class SplitData:
    partition: str
    ids: tuple[str, ...]
    X: np.ndarray
    y: np.ndarray
    product_ids: tuple[str, ...]
    mondays: tuple[str, ...]
    stockout_categories: tuple[str, ...]

    def __post_init__(self):
        n = len(self.ids)
        if (
            n == 0 or len(set(self.ids)) != n or self.X.shape != (n, len(FEATURE_NAMES))
            or self.y.shape != (n,) or len(self.product_ids) != n or len(self.mondays) != n
            or len(self.stockout_categories) != n or not np.isfinite(self.X).all()
            or not np.isfinite(self.y).all() or np.any(self.y < 0)
        ):
            raise ValueError("Invalid forecast split shape, IDs, values, or metadata")
        self.X.setflags(write=False)
        self.y.setflags(write=False)


class FrozenForecastSource:
    """Hash-pinned FORECAST-01 data; TEST labels become available only after selection."""

    def __init__(self, data_dir: Path, artifacts_dir: Path, expected_hash: str):
        self.data_dir, self.artifacts_dir = Path(data_dir), Path(artifacts_dir)
        manifest_path = self.artifacts_dir / "file_hashes.json"
        if sha256(manifest_path) != expected_hash:
            raise ValueError("FORECAST-01 hash manifest differs from the trusted checkpoint")
        self.hash_manifest_sha256 = expected_hash
        self.hashes = verify_artifacts(self.data_dir, self.artifacts_dir)["sha256"]
        self.feature_manifest = self._json("feature_manifest.json")
        self.target_manifest = self._json("target_manifest.json")
        self.split_manifest = self._json("split_manifest.json")
        self.provenance = self._json("provenance_manifest.json")
        if (
            self.feature_manifest.get("feature_allowlist") != list(FEATURE_NAMES)
            or self.feature_manifest.get("feature_count") != len(FEATURE_NAMES)
            or self.feature_manifest.get("feature_version") != FEATURE_VERSION
            or self.feature_manifest.get("target_censoring_metadata_is_feature") is not False
            or self.target_manifest.get("target_version") != TARGET_VERSION
            or self.split_manifest.get("split_version") != SPLIT_VERSION
            or self.split_manifest.get("random_split") is not False
            or self.provenance.get("data_origin") != "synthetic_development"
        ):
            raise ValueError("Incompatible frozen forecast feature/target/split/source manifest")
        self._ids = {
            part: tuple((self.data_dir / f"{part}_ids.txt").read_text(encoding="utf-8").splitlines())
            for part in ("train", "validation", "test")
        }
        if any(not ids or len(ids) != len(set(ids)) for ids in self._ids.values()):
            raise ValueError("Forecast split IDs must be nonempty and unique")
        all_ids = [key for ids in self._ids.values() for key in ids]
        if len(all_ids) != len(set(all_ids)):
            raise ValueError("Forecast split IDs overlap")
        self._index = self._read_index()
        if set(all_ids) != set(self._index):
            raise ValueError("Forecast split IDs differ from example index")
        for part, ids in self._ids.items():
            if any(self._index[key]["partition"] != part for key in ids):
                raise ValueError("Forecast split ID partition mismatch")
        self._test_opened = False

    def _json(self, name: str) -> dict:
        return json.loads((self.artifacts_dir / name).read_text(encoding="utf-8"))

    @staticmethod
    def _header(path: Path) -> list[str]:
        with path.open(encoding="utf-8", newline="") as handle:
            return next(csv.reader(handle))

    def _read_index(self) -> dict[str, dict[str, str]]:
        path = self.data_dir / "example_index.csv"
        with path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames != list(INDEX_COLUMNS):
                raise ValueError("Unexpected forecast example-index fields")
            rows = list(reader)
        if len(rows) != len({row["example_id"] for row in rows}):
            raise ValueError("Duplicate forecast example IDs")
        for row in rows:
            if (
                row["dataset_id"] != self.provenance["dataset_id"]
                or row["source_namespace"] != self.provenance["source_namespace"]
                or row["data_origin"] != "synthetic_development"
            ):
                raise ValueError("Forecast example provenance drift")
        return {row["example_id"]: row for row in rows}

    def read(self, partition: str) -> SplitData:
        if partition not in ("train", "validation"):
            raise ValueError("TEST requires a frozen validation-only selection")
        return self._read(partition)

    def open_test(self, decision: FrozenSelection) -> SplitData:
        if self._test_opened:
            raise ValueError("TEST has already been released")
        if decision.source_hash_manifest_sha256 != self.hash_manifest_sha256:
            raise ValueError("Selection belongs to a different forecast dataset")
        self._test_opened = True
        return self._read("test")

    def _check_current_hashes(self, partition: str):
        for name in ("example_index.csv", "feature_matrix.csv", "targets.csv", f"{partition}_ids.txt"):
            if sha256(self.data_dir / name) != self.hashes["data/" + name]:
                raise ValueError(f"Frozen forecast artifact changed before consumption: {name}")

    def _read(self, partition: str) -> SplitData:
        self._check_current_hashes(partition)
        feature_path, target_path = self.data_dir / "feature_matrix.csv", self.data_dir / "targets.csv"
        if self._header(feature_path) != ["example_id", *FEATURE_NAMES]:
            raise ValueError("Forecast feature matrix differs from exact ordered allowlist")
        if self._header(target_path) != list(TARGET_COLUMNS):
            raise ValueError("Unexpected forecast target fields")
        wanted, features, targets = set(self._ids[partition]), {}, {}
        with feature_path.open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                if row["example_id"] in wanted:
                    features[row["example_id"]] = np.asarray([float(row[name]) for name in FEATURE_NAMES], dtype=np.float64)
        with target_path.open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                if row["example_id"] in wanted:
                    if row["target_version"] != TARGET_VERSION or row["inventory_context_status"] != "observed":
                        raise ValueError("Incompatible forecast target row")
                    targets[row["example_id"]] = row
        ids = self._ids[partition]
        if set(features) != wanted or set(targets) != wanted:
            raise ValueError("Forecast split rows are missing from features or targets")
        categories = []
        for key in ids:
            target = targets[key]
            seconds = int(target["target_stockout_seconds"])
            full = target["target_full_week_stockout"] == "true"
            observed = target["target_stockout_observed"] == "true"
            if full != (seconds == 604800) or observed != (seconds > 0):
                raise ValueError("Forecast stockout metadata is internally inconsistent")
            categories.append("full_week_stockout" if full else "partial_stockout" if observed else "no_stockout")
        return SplitData(
            partition=partition,
            ids=ids,
            X=np.vstack([features[key] for key in ids]),
            y=np.asarray([float(targets[key]["target_completed_units"]) for key in ids], dtype=np.float64),
            product_ids=tuple(self._index[key]["product_id"] for key in ids),
            mondays=tuple(self._index[key]["observation_time"] for key in ids),
            stockout_categories=tuple(categories),
        )

