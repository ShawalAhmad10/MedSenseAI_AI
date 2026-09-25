"""Strict loaders and integrity checks for immutable TRAIN-01 artifacts."""

from __future__ import annotations

import csv
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from medsense_ai.ddi_training.pipeline import (
    LABEL_KNOWN_POSITIVE,
    LABEL_SAMPLED_UNLABELED_NEGATIVE,
)
from medsense_ai.medical_data_ingestion.normalization import normalize_medical_name

DRUG_COLUMNS = (
    "drug_id",
    "original_name",
    "normalized_name",
    "pubchem_cid",
    "canonical_smiles",
    "isomeric_smiles",
    "fingerprint_index",
)
PAIR_COLUMNS = (
    "pair_id",
    "drug_a_id",
    "drug_b_id",
    "label",
    "label_semantics",
    "split",
)
LABELED_PAIR_COLUMNS = PAIR_COLUMNS[:-1]


@dataclass(frozen=True, slots=True)
class DrugCatalog:
    fingerprints: np.ndarray
    drug_ids: tuple[str, ...]
    original_names: tuple[str, ...]
    normalized_names: tuple[str, ...]
    index_by_drug_id: dict[str, int]
    index_by_normalized_name: dict[str, int]


@dataclass(frozen=True, slots=True)
class PairTable:
    pair_ids: np.ndarray
    left_indices: np.ndarray
    right_indices: np.ndarray
    labels: np.ndarray
    splits: np.ndarray

    def subset(self, split: str) -> PairTable:
        mask = self.splits == split
        return PairTable(
            pair_ids=self.pair_ids[mask],
            left_indices=self.left_indices[mask],
            right_indices=self.right_indices[mask],
            labels=self.labels[mask],
            splits=self.splits[mask],
        )

    def __len__(self) -> int:
        return len(self.labels)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_drug_catalog(data_dir: Path) -> DrugCatalog:
    feature_path = data_dir / "drug_features.csv"
    fingerprint_path = data_dir / "morgan_fingerprints.npz"
    with feature_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if tuple(reader.fieldnames or ()) != DRUG_COLUMNS:
            raise ValueError(f"Unexpected drug feature schema in {feature_path}")
        rows = list(reader)
    if not rows:
        raise ValueError("TRAIN-01 drug feature table is empty")
    indices = [int(row["fingerprint_index"]) for row in rows]
    if indices != list(range(len(rows))):
        raise ValueError("Fingerprint indices must be unique, contiguous, and row-aligned")
    drug_ids = tuple(row["drug_id"] for row in rows)
    normalized_names = tuple(row["normalized_name"] for row in rows)
    if len(set(drug_ids)) != len(rows) or len(set(normalized_names)) != len(rows):
        raise ValueError("TRAIN-01 drug identifiers and normalized names must be unique")
    for row in rows:
        if normalize_medical_name(row["original_name"]) != row["normalized_name"]:
            raise ValueError("A TRAIN-01 normalized drug name is inconsistent")
        if not row["pubchem_cid"] or not (row["canonical_smiles"] or row["isomeric_smiles"]):
            raise ValueError("Every inference-supported drug must have CID and SMILES")
    with np.load(fingerprint_path, allow_pickle=False) as payload:
        fingerprints = payload["fingerprints"].copy()
        fingerprint_drug_ids = tuple(str(value) for value in payload["drug_ids"])
        radius = payload["radius"].tolist()
        bit_count = payload["bit_count"].tolist()
    if fingerprints.shape != (len(rows), 2048) or fingerprints.dtype != np.uint8:
        raise ValueError("Unexpected Morgan fingerprint matrix shape or dtype")
    if radius != [2] or bit_count != [2048]:
        raise ValueError("Unexpected TRAIN-01 Morgan fingerprint configuration")
    if fingerprint_drug_ids != drug_ids:
        raise ValueError("Fingerprint drug IDs do not align with drug_features.csv")
    if not np.logical_or(fingerprints == 0, fingerprints == 1).all():
        raise ValueError("Morgan fingerprints must be binary")
    return DrugCatalog(
        fingerprints=fingerprints,
        drug_ids=drug_ids,
        original_names=tuple(row["original_name"] for row in rows),
        normalized_names=normalized_names,
        index_by_drug_id={drug_id: index for index, drug_id in enumerate(drug_ids)},
        index_by_normalized_name={name: index for index, name in enumerate(normalized_names)},
    )


def load_pair_table(path: Path, catalog: DrugCatalog) -> PairTable:
    pair_ids: list[str] = []
    left: list[int] = []
    right: list[int] = []
    labels: list[int] = []
    splits: list[str] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if tuple(reader.fieldnames or ()) != PAIR_COLUMNS:
            raise ValueError(f"Unexpected pair split schema in {path}")
        for line_number, row in enumerate(reader, start=2):
            try:
                left_index = catalog.index_by_drug_id[row["drug_a_id"]]
                right_index = catalog.index_by_drug_id[row["drug_b_id"]]
            except KeyError as exc:
                raise ValueError(f"Unknown drug ID at {path}:{line_number}") from exc
            label = int(row["label"])
            expected_semantics = (
                LABEL_KNOWN_POSITIVE if label == 1 else LABEL_SAMPLED_UNLABELED_NEGATIVE
            )
            if label not in (0, 1) or row["label_semantics"] != expected_semantics:
                raise ValueError(f"Invalid label semantics at {path}:{line_number}")
            if row["split"] not in {"train", "validation", "test"}:
                raise ValueError(f"Invalid split at {path}:{line_number}")
            if left_index == right_index:
                raise ValueError(f"Self-pair at {path}:{line_number}")
            normalized_pair = (
                catalog.normalized_names[left_index],
                catalog.normalized_names[right_index],
            )
            if normalized_pair != tuple(sorted(normalized_pair)):
                raise ValueError(f"Non-canonical pair orientation at {path}:{line_number}")
            pair_ids.append(row["pair_id"])
            left.append(left_index)
            right.append(right_index)
            labels.append(label)
            splits.append(row["split"])
    if len(pair_ids) != len(set(pair_ids)):
        raise ValueError(f"Duplicate pair IDs in {path}")
    return PairTable(
        pair_ids=np.asarray(pair_ids),
        left_indices=np.asarray(left, dtype=np.int32),
        right_indices=np.asarray(right, dtype=np.int32),
        labels=np.asarray(labels, dtype=np.uint8),
        splits=np.asarray(splits),
    )


def _load_labeled_pair_ids(
    path: Path, catalog: DrugCatalog, *, expected_label: int
) -> set[str]:
    expected_semantics = (
        LABEL_KNOWN_POSITIVE
        if expected_label == 1
        else LABEL_SAMPLED_UNLABELED_NEGATIVE
    )
    pair_ids: set[str] = set()
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if tuple(reader.fieldnames or ()) != LABELED_PAIR_COLUMNS:
            raise ValueError(f"Unexpected labeled pair schema in {path}")
        for line_number, row in enumerate(reader, start=2):
            if int(row["label"]) != expected_label or row["label_semantics"] != expected_semantics:
                raise ValueError(f"Unexpected label at {path}:{line_number}")
            try:
                left_index = catalog.index_by_drug_id[row["drug_a_id"]]
                right_index = catalog.index_by_drug_id[row["drug_b_id"]]
            except KeyError as exc:
                raise ValueError(f"Unknown drug ID at {path}:{line_number}") from exc
            normalized_pair = (
                catalog.normalized_names[left_index],
                catalog.normalized_names[right_index],
            )
            if normalized_pair != tuple(sorted(normalized_pair)):
                raise ValueError(f"Non-canonical pair orientation at {path}:{line_number}")
            if row["pair_id"] in pair_ids:
                raise ValueError(f"Duplicate pair ID in {path}: {row['pair_id']}")
            pair_ids.add(row["pair_id"])
    return pair_ids


def _counts_by_split(table: PairTable) -> dict[str, int]:
    return {
        split: int(np.count_nonzero(table.splits == split))
        for split in ("train", "validation", "test")
    }


def validate_split_isolation(table: PairTable, *, drug_disjoint: bool) -> None:
    pair_sets = {
        split: set(table.pair_ids[table.splits == split].tolist())
        for split in ("train", "validation", "test")
    }
    if (
        pair_sets["train"] & pair_sets["validation"]
        or pair_sets["train"] & pair_sets["test"]
        or pair_sets["validation"] & pair_sets["test"]
    ):
        raise ValueError("Pair leakage detected across splits")
    if drug_disjoint:
        endpoint_sets = {}
        for split in ("train", "validation", "test"):
            mask = table.splits == split
            endpoint_sets[split] = set(table.left_indices[mask].tolist()) | set(
                table.right_indices[mask].tolist()
            )
        if (
            endpoint_sets["train"] & endpoint_sets["validation"]
            or endpoint_sets["train"] & endpoint_sets["test"]
            or endpoint_sets["validation"] & endpoint_sets["test"]
        ):
            raise ValueError("Drug endpoint leakage detected in strict drug-disjoint split")


def validate_train01_artifacts(data_dir: Path, provenance_dir: Path) -> dict[str, object]:
    required_data = (
        "drug_features.csv",
        "morgan_fingerprints.npz",
        "known_positive_pairs.csv",
        "sampled_unlabeled_negatives.csv",
        "pair_splits.csv",
        "drug_disjoint_splits.csv",
    )
    required_provenance = (
        "dataset_build_report.json",
        "provenance_manifest.json",
        "pubchem_compound_cache.csv",
    )
    for path in [*(data_dir / name for name in required_data), *(provenance_dir / name for name in required_provenance)]:
        if not path.is_file():
            raise FileNotFoundError(f"Required immutable TRAIN-01 artifact is missing: {path}")
    catalog = load_drug_catalog(data_dir)
    pair_table = load_pair_table(data_dir / "pair_splits.csv", catalog)
    cold_table = load_pair_table(data_dir / "drug_disjoint_splits.csv", catalog)
    positive_pair_ids = _load_labeled_pair_ids(
        data_dir / "known_positive_pairs.csv", catalog, expected_label=1
    )
    negative_pair_ids = _load_labeled_pair_ids(
        data_dir / "sampled_unlabeled_negatives.csv", catalog, expected_label=0
    )
    if positive_pair_ids & negative_pair_ids:
        raise ValueError("TRAIN-01 positive and sampled-unlabeled pair sets overlap")
    split_positive_ids = set(pair_table.pair_ids[pair_table.labels == 1].tolist())
    split_negative_ids = set(pair_table.pair_ids[pair_table.labels == 0].tolist())
    if split_positive_ids != positive_pair_ids or split_negative_ids != negative_pair_ids:
        raise ValueError("Pair split membership does not exactly match TRAIN-01 labeled pair files")
    validate_split_isolation(pair_table, drug_disjoint=False)
    validate_split_isolation(cold_table, drug_disjoint=True)
    report = json.loads((provenance_dir / "dataset_build_report.json").read_text(encoding="utf-8"))
    pair_counts = _counts_by_split(pair_table)
    cold_counts = _counts_by_split(cold_table)
    if pair_counts != report["pair_split_sizes"]:
        raise ValueError("Pair split counts do not match the TRAIN-01 report")
    if cold_counts != report["drug_disjoint_split_sizes"]:
        raise ValueError("Drug-disjoint split counts do not match the TRAIN-01 report")
    if len(catalog.drug_ids) != report["pubchem_resolved_count"]:
        raise ValueError("Drug catalog count does not match the TRAIN-01 report")
    if len(positive_pair_ids) != report["usable_positive_pairs"]:
        raise ValueError("Known-positive count does not match the TRAIN-01 report")
    if len(negative_pair_ids) != report["sampled_unlabeled_negative_count"]:
        raise ValueError("Sampled-unlabeled count does not match the TRAIN-01 report")
    hashes = {
        name: sha256_file(data_dir / name)
        for name in required_data
    }
    hashes.update(
        {name: sha256_file(provenance_dir / name) for name in required_provenance}
    )
    return {
        "catalog": catalog,
        "pair_table": pair_table,
        "cold_table": cold_table,
        "pair_split_sizes": pair_counts,
        "drug_disjoint_split_sizes": cold_counts,
        "input_sha256": hashes,
        "train01_report": report,
    }
