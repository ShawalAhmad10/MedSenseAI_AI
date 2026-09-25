"""Deterministic preparation of a research binary DDI training dataset."""

from __future__ import annotations

import csv
import hashlib
import itertools
import json
import logging
import os
import random
import time
from collections import defaultdict
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Iterable, Sequence

from medsense_ai.ddi_training.pubchem import (
    CompoundResolution,
    ResolutionStatus,
    write_resolution_cache,
)
from medsense_ai.medical_data_ingestion.normalization import normalize_medical_name

logger = logging.getLogger(__name__)

SOURCE_COLUMNS = ("Drug 1", "Drug 2", "Interaction Description")
LABEL_KNOWN_POSITIVE = "known_positive"
LABEL_SAMPLED_UNLABELED_NEGATIVE = "sampled_unlabeled_negative"
DEFAULT_SEED = 20260902
FINGERPRINT_RADIUS = 2
FINGERPRINT_BITS = 2048


@dataclass(frozen=True, slots=True)
class SourceAssertion:
    source_row_number: int
    original_drug_1: str
    original_drug_2: str
    interaction_description: str
    normalized_drug_a: str
    normalized_drug_b: str


@dataclass(frozen=True, slots=True)
class CanonicalPositivePair:
    pair_id: str
    drug_a: str
    drug_b: str
    normalized_drug_a: str
    normalized_drug_b: str
    source_assertion_count: int

    @property
    def key(self) -> tuple[str, str]:
        return self.normalized_drug_a, self.normalized_drug_b


@dataclass(frozen=True, slots=True)
class SourceDataset:
    original_row_count: int
    pairs: tuple[CanonicalPositivePair, ...]
    assertions: tuple[SourceAssertion, ...]
    drug_names: tuple[str, ...]
    source_sha256: str


@dataclass(frozen=True, slots=True)
class DrugFeature:
    drug_id: str
    original_name: str
    normalized_name: str
    pubchem_cid: int
    canonical_smiles: str | None
    isomeric_smiles: str | None
    fingerprint_index: int


@dataclass(frozen=True, slots=True)
class PairExample:
    pair_id: str
    drug_a_id: str
    drug_b_id: str
    normalized_drug_a: str
    normalized_drug_b: str
    label: int
    label_semantics: str
    split: str | None = None

    @property
    def key(self) -> tuple[str, str]:
        return self.normalized_drug_a, self.normalized_drug_b


def stable_identifier(prefix: str, *parts: str) -> str:
    digest = hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()[:20]
    return f"{prefix}_{digest}"


def canonical_pair(drug_a: str, drug_b: str) -> tuple[str, str]:
    """Return a normalized unordered pair; self-pairs are rejected."""
    normalized_a = normalize_medical_name(drug_a)
    normalized_b = normalize_medical_name(drug_b)
    if normalized_a == normalized_b:
        raise ValueError("A DDI pair must contain two distinct normalized drug names")
    return tuple(sorted((normalized_a, normalized_b)))  # type: ignore[return-value]


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_positive_source(path: Path) -> SourceDataset:
    """Validate the primary CSV and preserve each original source assertion."""
    display_name_by_normalized: dict[str, str] = {}
    assertions_by_pair: dict[tuple[str, str], list[SourceAssertion]] = defaultdict(list)
    exact_names: set[str] = set()
    original_row_count = 0
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if tuple(reader.fieldnames or ()) != SOURCE_COLUMNS:
            raise ValueError(
                f"Expected source columns {SOURCE_COLUMNS}, got {tuple(reader.fieldnames or ())}"
            )
        for source_row_number, row in enumerate(reader, start=2):
            original_row_count += 1
            drug_1 = row["Drug 1"].strip()
            drug_2 = row["Drug 2"].strip()
            description = row["Interaction Description"].strip()
            if not drug_1 or not drug_2 or not description:
                raise ValueError(f"Blank required value at source row {source_row_number}")
            normalized_a, normalized_b = canonical_pair(drug_1, drug_2)
            display_name_by_normalized.setdefault(normalize_medical_name(drug_1), drug_1)
            display_name_by_normalized.setdefault(normalize_medical_name(drug_2), drug_2)
            exact_names.update((drug_1, drug_2))
            assertions_by_pair[(normalized_a, normalized_b)].append(
                SourceAssertion(
                    source_row_number=source_row_number,
                    original_drug_1=drug_1,
                    original_drug_2=drug_2,
                    interaction_description=description,
                    normalized_drug_a=normalized_a,
                    normalized_drug_b=normalized_b,
                )
            )
    if not original_row_count:
        raise ValueError("The positive DDI source is empty")
    if len(exact_names) != len(display_name_by_normalized):
        logger.warning(
            "The source contains multiple exact spellings for at least one normalized drug name"
        )
    pairs = tuple(
        CanonicalPositivePair(
            pair_id=stable_identifier("pair", normalized_a, normalized_b),
            drug_a=display_name_by_normalized[normalized_a],
            drug_b=display_name_by_normalized[normalized_b],
            normalized_drug_a=normalized_a,
            normalized_drug_b=normalized_b,
            source_assertion_count=len(pair_assertions),
        )
        for (normalized_a, normalized_b), pair_assertions in sorted(assertions_by_pair.items())
    )
    assertions = tuple(
        assertion
        for pair_key in sorted(assertions_by_pair)
        for assertion in sorted(
            assertions_by_pair[pair_key], key=lambda item: item.source_row_number
        )
    )
    drug_names = tuple(
        display_name_by_normalized[name] for name in sorted(display_name_by_normalized)
    )
    return SourceDataset(
        original_row_count=original_row_count,
        pairs=pairs,
        assertions=assertions,
        drug_names=drug_names,
        source_sha256=file_sha256(path),
    )


def _atomic_csv(path: Path, fieldnames: Sequence[str], rows: Iterable[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
        handle.flush()
        os.fsync(handle.fileno())
    _replace_with_retry(temporary, path)


def _replace_with_retry(temporary: Path, path: Path) -> None:
    for attempt in range(8):
        try:
            os.replace(temporary, path)
            return
        except PermissionError:
            if attempt == 7:
                raise
            time.sleep(0.05 * (attempt + 1))


def write_source_provenance(dataset: SourceDataset, artifacts_dir: Path) -> None:
    _atomic_csv(
        artifacts_dir / "canonical_positive_pairs.csv",
        (
            "pair_id",
            "drug_a",
            "drug_b",
            "normalized_drug_a",
            "normalized_drug_b",
            "source_assertion_count",
        ),
        (
            {
                "pair_id": pair.pair_id,
                "drug_a": pair.drug_a,
                "drug_b": pair.drug_b,
                "normalized_drug_a": pair.normalized_drug_a,
                "normalized_drug_b": pair.normalized_drug_b,
                "source_assertion_count": pair.source_assertion_count,
            }
            for pair in dataset.pairs
        ),
    )
    _atomic_csv(
        artifacts_dir / "positive_pair_source_assertions.csv",
        (
            "pair_id",
            "source_row_number",
            "original_drug_1",
            "original_drug_2",
            "interaction_description",
        ),
        (
            {
                "pair_id": stable_identifier(
                    "pair", assertion.normalized_drug_a, assertion.normalized_drug_b
                ),
                "source_row_number": assertion.source_row_number,
                "original_drug_1": assertion.original_drug_1,
                "original_drug_2": assertion.original_drug_2,
                "interaction_description": assertion.interaction_description,
            }
            for assertion in dataset.assertions
        ),
    )


def generate_morgan_fingerprints(
    resolutions: dict[str, CompoundResolution],
    *,
    cache_path: Path,
    output_path: Path,
) -> tuple[tuple[DrugFeature, ...], dict[str, CompoundResolution]]:
    """Validate resolved SMILES with RDKit and persist a packed feature matrix."""
    try:
        import numpy as np
        from rdkit import Chem, DataStructs
        from rdkit.Chem import rdFingerprintGenerator
    except ImportError as exc:
        raise RuntimeError(
            "DDI training dependencies are missing; install the ddi-training optional dependency group"
        ) from exc

    updated = dict(resolutions)
    valid: list[tuple[str, CompoundResolution, object]] = []
    for original_name, resolution in sorted(
        resolutions.items(), key=lambda item: item[1].normalized_name
    ):
        if resolution.resolution_status is not ResolutionStatus.RESOLVED:
            continue
        smiles = resolution.isomeric_smiles or resolution.canonical_smiles
        molecule = Chem.MolFromSmiles(smiles) if smiles else None
        if molecule is None:
            invalid = replace(
                resolution,
                resolution_status=ResolutionStatus.INVALID_STRUCTURE,
                failure_or_ambiguity_reason="RDKit could not parse the PubChem SMILES",
            )
            updated[original_name] = invalid
            logger.warning("Quarantining unparseable PubChem structure for %r", original_name)
            continue
        valid.append((original_name, resolution, molecule))
    if updated != resolutions:
        write_resolution_cache(cache_path, updated.values())

    generator = rdFingerprintGenerator.GetMorganGenerator(
        radius=FINGERPRINT_RADIUS, fpSize=FINGERPRINT_BITS
    )
    matrix = np.zeros((len(valid), FINGERPRINT_BITS), dtype=np.uint8)
    features: list[DrugFeature] = []
    for fingerprint_index, (original_name, resolution, molecule) in enumerate(valid):
        fingerprint = generator.GetFingerprint(molecule)
        DataStructs.ConvertToNumpyArray(fingerprint, matrix[fingerprint_index])
        features.append(
            DrugFeature(
                drug_id=stable_identifier("drug", resolution.normalized_name),
                original_name=original_name,
                normalized_name=resolution.normalized_name,
                pubchem_cid=resolution.pubchem_cid or 0,
                canonical_smiles=resolution.canonical_smiles,
                isomeric_smiles=resolution.isomeric_smiles,
                fingerprint_index=fingerprint_index,
            )
        )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_suffix(output_path.suffix + ".tmp")
    with temporary.open("wb") as handle:
        np.savez_compressed(
            handle,
            fingerprints=matrix,
            drug_ids=np.asarray([feature.drug_id for feature in features]),
            radius=np.asarray([FINGERPRINT_RADIUS], dtype=np.int16),
            bit_count=np.asarray([FINGERPRINT_BITS], dtype=np.int16),
        )
    _replace_with_retry(temporary, output_path)
    return tuple(features), updated


def make_positive_examples(
    source: SourceDataset, features: Sequence[DrugFeature]
) -> tuple[PairExample, ...]:
    feature_by_name = {feature.normalized_name: feature for feature in features}
    examples: list[PairExample] = []
    for pair in source.pairs:
        feature_a = feature_by_name.get(pair.normalized_drug_a)
        feature_b = feature_by_name.get(pair.normalized_drug_b)
        if feature_a is None or feature_b is None:
            continue
        examples.append(
            PairExample(
                pair_id=pair.pair_id,
                drug_a_id=feature_a.drug_id,
                drug_b_id=feature_b.drug_id,
                normalized_drug_a=pair.normalized_drug_a,
                normalized_drug_b=pair.normalized_drug_b,
                label=1,
                label_semantics=LABEL_KNOWN_POSITIVE,
            )
        )
    return tuple(examples)


def sample_unlabeled_negatives(
    features: Sequence[DrugFeature],
    *,
    all_positive_keys: set[tuple[str, str]],
    count: int,
    seed: int = DEFAULT_SEED,
) -> tuple[PairExample, ...]:
    """Sample absent source pairs without making a clinical non-interaction claim."""
    if count < 0:
        raise ValueError("count cannot be negative")
    feature_by_name = {feature.normalized_name: feature for feature in features}
    candidates = [
        key
        for key in itertools.combinations(sorted(feature_by_name), 2)
        if key not in all_positive_keys
    ]
    if count > len(candidates):
        raise ValueError(
            f"Requested {count} sampled-unlabeled negatives but only {len(candidates)} candidates exist"
        )
    selected = random.Random(seed).sample(candidates, count)
    examples = []
    for normalized_a, normalized_b in sorted(selected):
        feature_a = feature_by_name[normalized_a]
        feature_b = feature_by_name[normalized_b]
        examples.append(
            PairExample(
                pair_id=stable_identifier("pair", normalized_a, normalized_b),
                drug_a_id=feature_a.drug_id,
                drug_b_id=feature_b.drug_id,
                normalized_drug_a=normalized_a,
                normalized_drug_b=normalized_b,
                label=0,
                label_semantics=LABEL_SAMPLED_UNLABELED_NEGATIVE,
            )
        )
    return tuple(examples)


def _allocation(size: int) -> tuple[int, int, int]:
    if size < 3:
        raise ValueError("At least three examples per class are required for three-way splitting")
    validation = max(1, int(size * 0.1))
    test = max(1, int(size * 0.1))
    train = size - validation - test
    if train < 1:
        raise ValueError("Split allocation left no training examples")
    return train, validation, test


def deterministic_pair_split(
    examples: Sequence[PairExample], *, seed: int = DEFAULT_SEED
) -> tuple[PairExample, ...]:
    output: list[PairExample] = []
    for label in (0, 1):
        group = sorted((item for item in examples if item.label == label), key=lambda item: item.pair_id)
        random.Random(seed + label).shuffle(group)
        train_count, validation_count, _ = _allocation(len(group))
        for index, item in enumerate(group):
            split = (
                "train"
                if index < train_count
                else "validation"
                if index < train_count + validation_count
                else "test"
            )
            output.append(replace(item, split=split))
    return tuple(sorted(output, key=lambda item: (item.split or "", item.pair_id)))


def deterministic_drug_disjoint_split(
    examples: Sequence[PairExample],
    features: Sequence[DrugFeature],
    *,
    seed: int = DEFAULT_SEED,
) -> tuple[PairExample, ...]:
    """Build a strict endpoint-disjoint split; cross-partition pairs are omitted."""
    names = sorted(feature.normalized_name for feature in features)
    random.Random(seed + 1000).shuffle(names)
    train_count, validation_count, _ = _allocation(len(names))
    partition: dict[str, str] = {}
    for index, name in enumerate(names):
        partition[name] = (
            "train"
            if index < train_count
            else "validation"
            if index < train_count + validation_count
            else "test"
        )
    output = tuple(
        replace(item, split=partition[item.normalized_drug_a])
        for item in examples
        if partition[item.normalized_drug_a] == partition[item.normalized_drug_b]
    )
    for split in ("train", "validation", "test"):
        split_items = [item for item in output if item.split == split]
        if len(split_items) < 2 or {item.label for item in split_items} != {0, 1}:
            logger.warning("Strict drug-disjoint split is insufficient; omitting it")
            return ()
    return tuple(sorted(output, key=lambda item: (item.split or "", item.pair_id)))


def validate_no_leakage(examples: Sequence[PairExample]) -> dict[str, bool]:
    keys = [item.key for item in examples]
    pair_unique = len(keys) == len(set(keys))
    orientation_canonical = all(item.key == tuple(sorted(item.key)) for item in examples)
    split_sets = {
        split: {item.key for item in examples if item.split == split}
        for split in ("train", "validation", "test")
    }
    split_disjoint = not (
        split_sets["train"] & split_sets["validation"]
        or split_sets["train"] & split_sets["test"]
        or split_sets["validation"] & split_sets["test"]
    )
    return {
        "canonical_pair_unique": pair_unique,
        "reversed_pair_absent": orientation_canonical,
        "pair_splits_disjoint": split_disjoint,
    }


def validate_drug_disjoint(examples: Sequence[PairExample]) -> bool:
    endpoint_sets: dict[str, set[str]] = {}
    for split in ("train", "validation", "test"):
        endpoint_sets[split] = {
            name
            for item in examples
            if item.split == split
            for name in (item.normalized_drug_a, item.normalized_drug_b)
        }
    return not (
        endpoint_sets["train"] & endpoint_sets["validation"]
        or endpoint_sets["train"] & endpoint_sets["test"]
        or endpoint_sets["validation"] & endpoint_sets["test"]
    )


def _write_features(path: Path, features: Sequence[DrugFeature]) -> None:
    _atomic_csv(
        path,
        (
            "drug_id",
            "original_name",
            "normalized_name",
            "pubchem_cid",
            "canonical_smiles",
            "isomeric_smiles",
            "fingerprint_index",
        ),
        (
            {
                "drug_id": feature.drug_id,
                "original_name": feature.original_name,
                "normalized_name": feature.normalized_name,
                "pubchem_cid": feature.pubchem_cid,
                "canonical_smiles": feature.canonical_smiles or "",
                "isomeric_smiles": feature.isomeric_smiles or "",
                "fingerprint_index": feature.fingerprint_index,
            }
            for feature in features
        ),
    )


def _write_examples(path: Path, examples: Sequence[PairExample], *, include_split: bool) -> None:
    fieldnames = ["pair_id", "drug_a_id", "drug_b_id", "label", "label_semantics"]
    if include_split:
        fieldnames.append("split")
    _atomic_csv(
        path,
        fieldnames,
        (
            {
                "pair_id": item.pair_id,
                "drug_a_id": item.drug_a_id,
                "drug_b_id": item.drug_b_id,
                "label": item.label,
                "label_semantics": item.label_semantics,
                **({"split": item.split or ""} if include_split else {}),
            }
            for item in examples
        ),
    )


def _split_sizes(examples: Sequence[PairExample]) -> dict[str, int]:
    return {
        split: sum(item.split == split for item in examples)
        for split in ("train", "validation", "test")
    }


def _atomic_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    _replace_with_retry(temporary, path)


def build_training_artifacts(
    *,
    source_path: Path,
    source: SourceDataset,
    resolutions: dict[str, CompoundResolution],
    cache_path: Path,
    processed_dir: Path,
    artifacts_dir: Path,
    seed: int = DEFAULT_SEED,
) -> dict[str, object]:
    write_source_provenance(source, artifacts_dir)
    features, updated_resolutions = generate_morgan_fingerprints(
        resolutions,
        cache_path=cache_path,
        output_path=processed_dir / "morgan_fingerprints.npz",
    )
    _write_features(processed_dir / "drug_features.csv", features)

    positives = make_positive_examples(source, features)
    all_positive_keys = {pair.key for pair in source.pairs}
    negatives = sample_unlabeled_negatives(
        features,
        all_positive_keys=all_positive_keys,
        count=len(positives),
        seed=seed,
    )
    combined = positives + negatives
    pair_split = deterministic_pair_split(combined, seed=seed)
    disjoint_split = deterministic_drug_disjoint_split(combined, features, seed=seed)
    pair_leakage = validate_no_leakage(pair_split)
    cold_leakage = validate_no_leakage(disjoint_split) if disjoint_split else {}
    cold_drugs_disjoint = validate_drug_disjoint(disjoint_split) if disjoint_split else False
    if not all(pair_leakage.values()) or (disjoint_split and (not all(cold_leakage.values()) or not cold_drugs_disjoint)):
        raise ValueError("Leakage validation failed; refusing to persist final pair datasets")

    _write_examples(processed_dir / "known_positive_pairs.csv", positives, include_split=False)
    _write_examples(
        processed_dir / "sampled_unlabeled_negatives.csv", negatives, include_split=False
    )
    _write_examples(processed_dir / "pair_splits.csv", pair_split, include_split=True)
    if disjoint_split:
        _write_examples(
            processed_dir / "drug_disjoint_splits.csv", disjoint_split, include_split=True
        )

    unresolved = tuple(
        record
        for record in updated_resolutions.values()
        if record.resolution_status is not ResolutionStatus.RESOLVED
    )
    _atomic_csv(
        artifacts_dir / "pubchem_unresolved_or_ambiguous.csv",
        (
            "original_name",
            "normalized_name",
            "pubchem_cid",
            "resolution_status",
            "failure_or_ambiguity_reason",
            "candidate_cids_json",
        ),
        (
            {
                "original_name": record.original_name,
                "normalized_name": record.normalized_name,
                "pubchem_cid": record.pubchem_cid or "",
                "resolution_status": record.resolution_status.value,
                "failure_or_ambiguity_reason": record.failure_or_ambiguity_reason or "",
                "candidate_cids_json": record.candidate_cids_json,
            }
            for record in sorted(unresolved, key=lambda item: item.normalized_name)
        ),
    )
    resolved_count = sum(
        record.resolution_status is ResolutionStatus.RESOLVED
        for record in updated_resolutions.values()
    )
    report: dict[str, object] = {
        "total_original_interaction_rows": source.original_row_count,
        "unique_positive_pairs": len(source.pairs),
        "unique_drug_names": len(source.drug_names),
        "pubchem_resolved_count": resolved_count,
        "pubchem_resolved_percentage": round(
            100 * resolved_count / len(source.drug_names), 4
        ),
        "unresolved_or_ambiguous_count": len(source.drug_names) - resolved_count,
        "usable_positive_pairs": len(positives),
        "sampled_unlabeled_negative_count": len(negatives),
        "pair_split_sizes": _split_sizes(pair_split),
        "drug_disjoint_split_sizes": _split_sizes(disjoint_split) if disjoint_split else None,
        "drug_disjoint_cross_partition_pairs_omitted": (
            len(combined) - len(disjoint_split) if disjoint_split else None
        ),
        "leakage_checks": {
            **pair_leakage,
            "drug_disjoint_pair_checks": all(cold_leakage.values()) if cold_leakage else False,
            "drug_disjoint_endpoint_sets": cold_drugs_disjoint,
            "negative_positive_overlap_absent": not (
                {item.key for item in positives} & {item.key for item in negatives}
            ),
        },
    }
    _atomic_json(artifacts_dir / "dataset_build_report.json", report)
    _atomic_json(
        artifacts_dir / "provenance_manifest.json",
        {
            "source": {
                "path": str(source_path.resolve()),
                "sha256": source.source_sha256,
                "columns": list(SOURCE_COLUMNS),
            },
            "pubchem": {
                "service": "PubChem PUG REST",
                "base_url": "https://pubchem.ncbi.nlm.nih.gov/rest/pug",
                "name_lookup": "exact full-name lookup; ambiguous multi-CID results quarantined",
                "property_fields": ["ConnectivitySMILES", "SMILES"],
            },
            "fingerprint": {
                "implementation": "RDKit Morgan fingerprint generator",
                "radius": FINGERPRINT_RADIUS,
                "bit_count": FINGERPRINT_BITS,
            },
            "sampling": {
                "seed": seed,
                "negative_label_semantics": LABEL_SAMPLED_UNLABELED_NEGATIVE,
                "absent_source_pair_is_not_evidence_of_safety": True,
            },
            "scope": "controlled FYP/research dataset; not clinically validated or production-authorized",
        },
    )
    return report
