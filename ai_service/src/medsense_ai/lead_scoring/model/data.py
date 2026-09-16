"""Read the immutable SALES-04 export; release test rows only after frozen selection."""

import csv
from dataclasses import dataclass
from datetime import timedelta
import json
from pathlib import Path

import numpy as np

from medsense_ai.sales_data.contracts import utc_instant
from ..contracts import FEATURE_NAMES, FEATURE_VERSION, TARGET_VERSION, Features
from ..io import INDEX_COLUMNS, LABEL_COLUMNS, read_features, sha256, verify_artifacts
from ..splits import SUPERVISED, label_cutoff, partition_at, split_manifest
from .contracts import FrozenSelection


def feature_array(features: list[Features] | tuple[Features, ...]) -> np.ndarray:
    return np.asarray([[np.nan if getattr(row, name) is None else float(getattr(row, name))
                        for name in FEATURE_NAMES] for row in features], dtype=np.float64).reshape(-1, len(FEATURE_NAMES))


@dataclass(frozen=True)
class SplitData:
    partition: str
    ids: tuple[str, ...]
    X: np.ndarray
    y: np.ndarray
    mondays: tuple[str, ...]
    customers: tuple[str, ...]  # Diagnostic grouping only; never part of X.

    def __post_init__(self):
        n = len(self.ids)
        if (n == 0 or len(set(self.ids)) != n or self.X.shape != (n, len(FEATURE_NAMES))
                or self.y.shape != (n,) or len(self.mondays) != n or len(self.customers) != n
                or not np.isin(self.y, [0, 1]).all() or np.isinf(self.X).any()):
            raise ValueError("Invalid supervised split shape/IDs/labels/values")
        self.X.setflags(write=False)
        self.y.setflags(write=False)


class FrozenSource:
    def __init__(self, data_dir: Path, artifacts_dir: Path, expected_hash: str):
        self.data_dir, self.artifacts_dir = Path(data_dir), Path(artifacts_dir)
        manifest_path = self.artifacts_dir / "file_hashes.json"
        if sha256(manifest_path) != expected_hash:
            raise ValueError("SALES-04 hash manifest differs from the trusted checkpoint")
        self.hash_manifest_sha256 = expected_hash
        # Integrity/schema checks read all bytes; no test predictions or metrics are used here.
        self.hashes = verify_artifacts(self.data_dir, self.artifacts_dir)["sha256"]
        self.feature_manifest = self._json("feature_manifest.json")
        self.target_manifest = self._json("target_manifest.json")
        self.provenance = self._json("provenance_manifest.json")
        if (self.feature_manifest["feature_allowlist"] != list(FEATURE_NAMES)
                or self.feature_manifest["feature_version"] != FEATURE_VERSION
                or self.target_manifest["target_version"] != TARGET_VERSION
                or self._json("split_manifest.json") != split_manifest()
                or self.provenance["data_origin"] != "synthetic_development"):
            raise ValueError("Incompatible frozen feature/target/split/source manifest")
        self._ids = {p.value: tuple((self.data_dir/f"{p.value}_ids.txt").read_text().splitlines()) for p in SUPERVISED}
        self._index = self._csv("example_index.csv", INDEX_COLUMNS)
        self._labels = self._csv("labels.csv", LABEL_COLUMNS)
        all_ids = {key for ids in self._ids.values() for key in ids}
        if {key for key, r in self._index.items() if r["supervised"] == "true"} != all_ids:
            raise ValueError("Split IDs differ from supervised index rows")
        for partition, ids in self._ids.items():
            for key in ids:
                row, label = self._index[key], self._labels[key]
                at, horizon = utc_instant(row["observation_time"]), utc_instant(label["horizon_end"])
                if (row["partition"] != partition or partition_at(at).value != partition
                        or at.weekday() != 0 or any((at.hour, at.minute, at.second, at.microsecond))
                        or row["eligibility"] != "eligible" or row["label_status"] != "labeled"
                        or row["data_origin"] != "synthetic_development"
                        or row["dataset_id"] != self.provenance["dataset_id"]
                        or row["source_namespace"] != self.provenance["source_namespace"]
                        or horizon != at+timedelta(days=30)
                        or label["target_version"] != TARGET_VERSION
                        or utc_instant(label["label_evidence_cutoff"]) != label_cutoff(partition_at(at), utc_instant(self.provenance["source_extracted_at"]))):
                    raise ValueError("Split/label/index drift from the frozen temporal contract")
        self._test_opened = False

    def _json(self, name):
        return json.loads((self.artifacts_dir/name).read_text(encoding="utf-8"))

    def _csv(self, name, columns):
        with (self.data_dir/name).open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames != list(columns):
                raise ValueError(f"Unexpected {name} columns")
            rows = list(reader)
        if len({r["example_id"] for r in rows}) != len(rows):
            raise ValueError("Duplicate metadata/label IDs")
        return {r["example_id"]: r for r in rows}

    def read(self, partition: str) -> SplitData:
        if partition not in ("train", "validation"):
            raise ValueError("TEST requires a frozen validation-only selection")
        return self._read(partition)

    def open_test(self, decision: FrozenSelection) -> SplitData:
        if self._test_opened or decision.source_hash_manifest_sha256 != self.hash_manifest_sha256:
            raise ValueError("Test was already released or decision belongs to another source")
        self._test_opened = True
        return self._read("test")

    def _read(self, partition: str) -> SplitData:
        # Recheck mutable disk boundaries before consumption; the original pin is retained.
        for name in ("feature_matrix.csv", "labels.csv", f"{partition}_ids.txt"):
            if sha256(self.data_dir/name) != self.hashes["data/"+name]:
                raise ValueError("Processed source/split hash drift before consumption")
        ids = self._ids[partition]
        features = read_features(self.data_dir/"feature_matrix.csv")
        return SplitData(partition, ids, feature_array([features[k] for k in ids]),
                         np.asarray([int(self._labels[k]["label"]) for k in ids]),
                         tuple(self._index[k]["observation_time"] for k in ids),
                         tuple(self._index[k]["customer_id"] for k in ids))
