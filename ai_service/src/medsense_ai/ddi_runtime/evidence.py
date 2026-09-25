"""Exact, order-invariant lookup over the approved known-interaction CSV."""

from __future__ import annotations

import csv
import hashlib
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from medsense_ai.ddi_training.pipeline import canonical_pair

EXPECTED_COLUMNS = ("Drug 1", "Drug 2", "Interaction Description")


@dataclass(frozen=True, slots=True)
class KnownInteractionEvidence:
    descriptions: tuple[str, ...]
    record_identifiers: tuple[str, ...]


class KnownInteractionIndex:
    """Immutable in-memory exact-name evidence index loaded once at startup."""

    def __init__(self, source_path: Path) -> None:
        source_path = source_path.resolve()
        if not source_path.is_file():
            raise FileNotFoundError(f"Known interaction source is missing: {source_path}")
        digest = hashlib.sha256()
        with source_path.open("rb") as binary_handle:
            for chunk in iter(lambda: binary_handle.read(1024 * 1024), b""):
                digest.update(chunk)
        self.source_identifier = f"{source_path.name}@sha256:{digest.hexdigest()}"
        evidence: dict[tuple[str, str], list[tuple[int, str]]] = defaultdict(list)
        with source_path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if tuple(reader.fieldnames or ()) != EXPECTED_COLUMNS:
                raise ValueError(
                    f"Expected known interaction columns {EXPECTED_COLUMNS}, "
                    f"got {tuple(reader.fieldnames or ())}"
                )
            for source_row_number, row in enumerate(reader, start=2):
                drug_1 = row["Drug 1"].strip()
                drug_2 = row["Drug 2"].strip()
                description = row["Interaction Description"].strip()
                if not drug_1 or not drug_2 or not description:
                    raise ValueError(
                        f"Blank required known-interaction value at source row {source_row_number}"
                    )
                evidence[canonical_pair(drug_1, drug_2)].append(
                    (source_row_number, description)
                )
        self._evidence = {
            key: KnownInteractionEvidence(
                descriptions=tuple(description for _, description in rows),
                record_identifiers=tuple(
                    f"{source_path.name}:row:{row_number}" for row_number, _ in rows
                ),
            )
            for key, rows in evidence.items()
        }

    def lookup(self, normalized_a: str, normalized_b: str) -> KnownInteractionEvidence | None:
        return self._evidence.get(canonical_pair(normalized_a, normalized_b))

    def __len__(self) -> int:
        return len(self._evidence)
