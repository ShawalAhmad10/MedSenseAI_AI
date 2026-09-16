"""Focused tests for the research-only binary DDI dataset builder."""

from __future__ import annotations

import csv
from pathlib import Path

import pytest

from medsense_ai.ddi_training.pipeline import (
    LABEL_KNOWN_POSITIVE,
    LABEL_SAMPLED_UNLABELED_NEGATIVE,
    DrugFeature,
    PairExample,
    canonical_pair,
    deterministic_pair_split,
    load_positive_source,
    sample_unlabeled_negatives,
    stable_identifier,
    validate_no_leakage,
)
from medsense_ai.ddi_training.pubchem import (
    CompoundResolution,
    ResolutionStatus,
    resolve_compounds,
    write_resolution_cache,
)


class FakePubChemClient:
    def __init__(
        self,
        name_results: dict[str, tuple[int, ...]],
        properties: dict[int, tuple[str | None, str | None]] | None = None,
    ) -> None:
        self.name_results = name_results
        self.properties = properties or {}
        self.name_calls: list[str] = []
        self.property_calls: list[tuple[int, ...]] = []

    def name_to_cids(self, name: str) -> tuple[int, ...]:
        self.name_calls.append(name)
        return self.name_results[name]

    def properties_for_cids(
        self, cids: tuple[int, ...]
    ) -> dict[int, tuple[str | None, str | None]]:
        self.property_calls.append(cids)
        return {cid: self.properties[cid] for cid in cids if cid in self.properties}


def _write_source(path: Path, rows: list[tuple[str, str, str]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(("Drug 1", "Drug 2", "Interaction Description"))
        writer.writerows(rows)


def _feature(name: str, index: int) -> DrugFeature:
    return DrugFeature(
        drug_id=stable_identifier("drug", name),
        original_name=name.title(),
        normalized_name=name,
        pubchem_cid=index + 1,
        canonical_smiles="C",
        isomeric_smiles="C",
        fingerprint_index=index,
    )


def test_canonical_pair_is_unordered_and_rejects_self_pair() -> None:
    assert canonical_pair("  Drug Alpha ", "DRUG beta") == (
        "drug alpha",
        "drug beta",
    )
    assert canonical_pair("DRUG beta", "Drug Alpha") == (
        "drug alpha",
        "drug beta",
    )
    with pytest.raises(ValueError):
        canonical_pair("Drug Alpha", " drug alpha ")


def test_source_loader_deduplicates_reversed_pairs_and_preserves_every_description(
    tmp_path: Path,
) -> None:
    source_path = tmp_path / "source.csv"
    _write_source(
        source_path,
        [
            ("Drug Alpha", "Drug Beta", "synthetic assertion one"),
            ("Drug Beta", "Drug Alpha", "synthetic assertion two"),
            ("Drug Gamma", "Drug Delta", "synthetic assertion three"),
        ],
    )

    dataset = load_positive_source(source_path)

    assert dataset.original_row_count == 3
    assert len(dataset.pairs) == 2
    assert len(dataset.assertions) == 3
    duplicate_pair = next(pair for pair in dataset.pairs if pair.source_assertion_count == 2)
    descriptions = {
        assertion.interaction_description
        for assertion in dataset.assertions
        if (assertion.normalized_drug_a, assertion.normalized_drug_b) == duplicate_pair.key
    }
    assert descriptions == {"synthetic assertion one", "synthetic assertion two"}


def test_pubchem_cache_reuses_resolved_compound_without_network_call(
    tmp_path: Path,
) -> None:
    cache_path = tmp_path / "cache.csv"
    write_resolution_cache(
        cache_path,
        [
            CompoundResolution(
                original_name="Drug Alpha",
                normalized_name="drug alpha",
                pubchem_cid=123,
                canonical_smiles="C",
                isomeric_smiles="C",
                resolution_status=ResolutionStatus.RESOLVED,
                failure_or_ambiguity_reason=None,
                candidate_cids_json="[123]",
                attempted_at_utc="2026-01-01T00:00:00+00:00",
            )
        ],
    )
    client = FakePubChemClient({})

    resolved = resolve_compounds(
        ["Drug Alpha"], cache_path=cache_path, client=client
    )

    assert resolved["Drug Alpha"].resolution_status is ResolutionStatus.RESOLVED
    assert client.name_calls == []
    assert client.property_calls == []


def test_unresolved_and_ambiguous_pubchem_names_are_quarantined(
    tmp_path: Path,
) -> None:
    client = FakePubChemClient(
        {"Missing Drug": (), "Ambiguous Drug": (11, 12)}
    )

    resolved = resolve_compounds(
        ["Missing Drug", "Ambiguous Drug"],
        cache_path=tmp_path / "cache.csv",
        client=client,
    )

    assert resolved["Missing Drug"].resolution_status is ResolutionStatus.NOT_FOUND
    assert resolved["Ambiguous Drug"].resolution_status is ResolutionStatus.AMBIGUOUS
    assert resolved["Ambiguous Drug"].pubchem_cid is None
    assert resolved["Ambiguous Drug"].candidate_cids_json == "[11,12]"
    assert client.property_calls == []


def test_negative_sampling_is_reproducible_balanced_and_excludes_all_positives() -> None:
    features = tuple(_feature(name, index) for index, name in enumerate("abcde"))
    positive_keys = {("a", "b"), ("a", "c")}

    first = sample_unlabeled_negatives(
        features, all_positive_keys=positive_keys, count=2, seed=42
    )
    second = sample_unlabeled_negatives(
        features, all_positive_keys=positive_keys, count=2, seed=42
    )

    assert first == second
    assert len(first) == 2
    assert all(item.label == 0 for item in first)
    assert all(item.label_semantics == LABEL_SAMPLED_UNLABELED_NEGATIVE for item in first)
    assert not ({item.key for item in first} & positive_keys)
    assert len({item.key for item in first}) == len(first)


def test_pair_split_has_no_pair_or_reversed_pair_leakage() -> None:
    names = [chr(ord("a") + index) for index in range(8)]
    pairs = list(zip(names[:6], names[2:8], strict=True))
    positives = [
        PairExample(
            pair_id=stable_identifier("pair", *canonical_pair(a, b)),
            drug_a_id=stable_identifier("drug", canonical_pair(a, b)[0]),
            drug_b_id=stable_identifier("drug", canonical_pair(a, b)[1]),
            normalized_drug_a=canonical_pair(a, b)[0],
            normalized_drug_b=canonical_pair(a, b)[1],
            label=1,
            label_semantics=LABEL_KNOWN_POSITIVE,
        )
        for a, b in pairs
    ]
    negative_pairs = [("a", "h"), ("b", "g"), ("c", "h"), ("d", "g"), ("a", "f"), ("b", "e")]
    negatives = [
        PairExample(
            pair_id=stable_identifier("pair", *canonical_pair(a, b)),
            drug_a_id=stable_identifier("drug", canonical_pair(a, b)[0]),
            drug_b_id=stable_identifier("drug", canonical_pair(a, b)[1]),
            normalized_drug_a=canonical_pair(a, b)[0],
            normalized_drug_b=canonical_pair(a, b)[1],
            label=0,
            label_semantics=LABEL_SAMPLED_UNLABELED_NEGATIVE,
        )
        for a, b in negative_pairs
    ]

    split = deterministic_pair_split(positives + negatives, seed=42)
    checks = validate_no_leakage(split)

    assert all(checks.values())
    assert {item.split for item in split} == {"train", "validation", "test"}
