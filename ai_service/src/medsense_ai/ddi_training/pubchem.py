"""Resumable, rate-limited PubChem PUG REST name resolution.

The resolver intentionally performs exact full-name lookups only. It does not
strip salts, use fuzzy matching, or select a preferred candidate when PubChem
returns multiple CIDs.
"""

from __future__ import annotations

import csv
import json
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Callable, Iterable, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from medsense_ai.medical_data_ingestion.normalization import normalize_medical_name

logger = logging.getLogger(__name__)

PUBCHEM_BASE_URL = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
CACHE_FIELDS = (
    "original_name",
    "normalized_name",
    "pubchem_cid",
    "canonical_smiles",
    "isomeric_smiles",
    "resolution_status",
    "failure_or_ambiguity_reason",
    "candidate_cids_json",
    "attempted_at_utc",
)


class ResolutionStatus(str, Enum):
    RESOLVED = "resolved"
    PENDING_STRUCTURE = "pending_structure"
    NOT_FOUND = "not_found"
    AMBIGUOUS = "ambiguous"
    STRUCTURE_UNAVAILABLE = "structure_unavailable"
    INVALID_STRUCTURE = "invalid_structure"
    TRANSIENT_ERROR = "transient_error"


TERMINAL_STATUSES = {
    ResolutionStatus.RESOLVED,
    ResolutionStatus.NOT_FOUND,
    ResolutionStatus.AMBIGUOUS,
    ResolutionStatus.STRUCTURE_UNAVAILABLE,
    ResolutionStatus.INVALID_STRUCTURE,
}


@dataclass(frozen=True, slots=True)
class CompoundResolution:
    original_name: str
    normalized_name: str
    pubchem_cid: int | None
    canonical_smiles: str | None
    isomeric_smiles: str | None
    resolution_status: ResolutionStatus
    failure_or_ambiguity_reason: str | None
    candidate_cids_json: str
    attempted_at_utc: str

    def to_csv_row(self) -> dict[str, str | int | None]:
        row = asdict(self)
        row["resolution_status"] = self.resolution_status.value
        row["pubchem_cid"] = self.pubchem_cid if self.pubchem_cid is not None else ""
        row["canonical_smiles"] = self.canonical_smiles or ""
        row["isomeric_smiles"] = self.isomeric_smiles or ""
        row["failure_or_ambiguity_reason"] = self.failure_or_ambiguity_reason or ""
        return row

    @classmethod
    def from_csv_row(cls, row: dict[str, str]) -> CompoundResolution:
        return cls(
            original_name=row["original_name"],
            normalized_name=row["normalized_name"],
            pubchem_cid=int(row["pubchem_cid"]) if row["pubchem_cid"] else None,
            canonical_smiles=row["canonical_smiles"] or None,
            isomeric_smiles=row["isomeric_smiles"] or None,
            resolution_status=ResolutionStatus(row["resolution_status"]),
            failure_or_ambiguity_reason=row["failure_or_ambiguity_reason"] or None,
            candidate_cids_json=row.get("candidate_cids_json", "[]") or "[]",
            attempted_at_utc=row["attempted_at_utc"],
        )


class PubChemLookup(Protocol):
    def name_to_cids(self, name: str) -> tuple[int, ...]: ...

    def properties_for_cids(self, cids: tuple[int, ...]) -> dict[int, tuple[str | None, str | None]]: ...


class PubChemNotFoundError(Exception):
    """PubChem reports that the exact name or CID has no record."""


class PubChemTransientError(Exception):
    """A retryable PubChem/network failure exhausted the local retry budget."""


class PubChemPermanentError(Exception):
    """A non-retryable PubChem response prevents resolution."""


class PubChemPUGClient:
    """Small official PUG REST client honoring PubChem's <=5 requests/second policy."""

    def __init__(
        self,
        *,
        requests_per_second: float = 4.0,
        timeout_seconds: float = 30.0,
        max_retries: int = 4,
        sleeper: Callable[[float], None] = time.sleep,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        if not 0 < requests_per_second <= 5:
            raise ValueError("requests_per_second must be greater than 0 and at most 5")
        self._minimum_interval = 1.0 / requests_per_second
        self._timeout_seconds = timeout_seconds
        self._max_retries = max_retries
        self._sleeper = sleeper
        self._monotonic = monotonic
        self._last_request_at: float | None = None
        self._rate_lock = threading.Lock()

    def _wait_for_rate_limit(self) -> None:
        with self._rate_lock:
            now = self._monotonic()
            if self._last_request_at is not None:
                remaining = self._minimum_interval - (now - self._last_request_at)
                if remaining > 0:
                    self._sleeper(remaining)
            self._last_request_at = self._monotonic()

    def _request_json(self, path: str) -> dict[str, object]:
        url = f"{PUBCHEM_BASE_URL}/{path}"
        for attempt in range(self._max_retries + 1):
            self._wait_for_rate_limit()
            request = Request(
                url,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "MedSenseAI-FYP-DDI-Dataset/0.1 (research dataset builder)",
                },
            )
            try:
                with urlopen(request, timeout=self._timeout_seconds) as response:
                    throttling = response.headers.get("X-Throttling-Control")
                    request_pressure = throttling and any(
                        marker in throttling
                        for marker in (
                            "Request Count status: Yellow",
                            "Request Count status: Red",
                            "Request Time status: Yellow",
                            "Request Time status: Red",
                        )
                    )
                    if request_pressure:
                        logger.warning("PubChem throttling status: %s", throttling)
                    payload = json.load(response)
                if not isinstance(payload, dict):
                    raise PubChemPermanentError("PubChem returned a non-object JSON response")
                return payload
            except HTTPError as exc:
                if exc.code == 404:
                    raise PubChemNotFoundError(f"PubChem returned HTTP 404 for {path}") from exc
                retryable = exc.code == 429 or 500 <= exc.code < 600
                if not retryable:
                    raise PubChemPermanentError(
                        f"PubChem returned non-retryable HTTP {exc.code} for {path}"
                    ) from exc
                retry_after = exc.headers.get("Retry-After")
                delay = float(retry_after) if retry_after and retry_after.isdigit() else 2**attempt
                logger.warning(
                    "Retryable PubChem HTTP %s (attempt %s/%s)",
                    exc.code,
                    attempt + 1,
                    self._max_retries + 1,
                )
            except (URLError, TimeoutError, OSError) as exc:
                delay = 2**attempt
                logger.warning(
                    "Retryable PubChem network failure (attempt %s/%s): %s",
                    attempt + 1,
                    self._max_retries + 1,
                    type(exc).__name__,
                )
            if attempt == self._max_retries:
                raise PubChemTransientError(
                    f"PubChem request failed after {self._max_retries + 1} attempts: {path}"
                )
            self._sleeper(delay)
        raise AssertionError("unreachable")

    def name_to_cids(self, name: str) -> tuple[int, ...]:
        payload = self._request_json(f"compound/name/{quote(name, safe='')}/cids/JSON")
        try:
            values = payload["IdentifierList"]["CID"]  # type: ignore[index]
            cids = tuple(sorted({int(value) for value in values}))  # type: ignore[union-attr]
        except (KeyError, TypeError, ValueError) as exc:
            raise PubChemPermanentError("PubChem CID response did not match the documented schema") from exc
        return cids

    def properties_for_cids(
        self, cids: tuple[int, ...]
    ) -> dict[int, tuple[str | None, str | None]]:
        if not cids:
            return {}
        cid_path = ",".join(str(cid) for cid in cids)
        payload = self._request_json(
            f"compound/cid/{cid_path}/property/ConnectivitySMILES,SMILES/JSON"
        )
        try:
            properties = payload["PropertyTable"]["Properties"]  # type: ignore[index]
        except (KeyError, TypeError) as exc:
            raise PubChemPermanentError(
                "PubChem property response did not match the documented schema"
            ) from exc
        if not isinstance(properties, list):
            raise PubChemPermanentError("PubChem Properties value was not a list")
        result: dict[int, tuple[str | None, str | None]] = {}
        for item in properties:
            if not isinstance(item, dict) or "CID" not in item:
                raise PubChemPermanentError("PubChem property item lacked a CID")
            cid = int(item["CID"])
            canonical = item.get("ConnectivitySMILES") or item.get("CanonicalSMILES")
            isomeric = item.get("SMILES") or item.get("IsomericSMILES")
            result[cid] = (
                str(canonical) if canonical else None,
                str(isomeric) if isomeric else None,
            )
        return result


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_resolution_cache(path: Path) -> dict[str, CompoundResolution]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if tuple(reader.fieldnames or ()) != CACHE_FIELDS:
            raise ValueError(f"Unexpected PubChem cache schema in {path}")
        records = [CompoundResolution.from_csv_row(row) for row in reader]
    if len(records) != len({record.original_name for record in records}):
        raise ValueError(f"Duplicate original_name entries in PubChem cache {path}")
    return {record.original_name: record for record in records}


def write_resolution_cache(path: Path, records: Iterable[CompoundResolution]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CACHE_FIELDS, lineterminator="\n")
        writer.writeheader()
        for record in sorted(records, key=lambda item: (item.normalized_name, item.original_name)):
            writer.writerow(record.to_csv_row())
        handle.flush()
        os.fsync(handle.fileno())
    for attempt in range(8):
        try:
            os.replace(temporary, path)
            break
        except PermissionError:
            if attempt == 7:
                raise
            time.sleep(0.05 * (attempt + 1))


def resolve_compounds(
    names: Iterable[str],
    *,
    cache_path: Path,
    client: PubChemLookup,
    property_batch_size: int = 50,
    name_lookup_workers: int = 4,
) -> dict[str, CompoundResolution]:
    """Resolve exact names, persisting after every lookup for safe resumption."""
    if property_batch_size < 1:
        raise ValueError("property_batch_size must be positive")
    if name_lookup_workers < 1:
        raise ValueError("name_lookup_workers must be positive")
    unique_names = tuple(sorted(set(names), key=lambda value: (normalize_medical_name(value), value)))
    cached = read_resolution_cache(cache_path)

    by_normalized: dict[str, CompoundResolution] = {}
    for record in cached.values():
        existing = by_normalized.get(record.normalized_name)
        if existing is None or existing.resolution_status not in TERMINAL_STATUSES:
            by_normalized[record.normalized_name] = record

    names_to_lookup: list[str] = []
    for original_name in unique_names:
        normalized_name = normalize_medical_name(original_name)
        current = cached.get(original_name)
        if current is not None and current.resolution_status in TERMINAL_STATUSES:
            continue
        reusable = by_normalized.get(normalized_name)
        if (
            reusable is not None
            and reusable.original_name != original_name
            and reusable.resolution_status is not ResolutionStatus.TRANSIENT_ERROR
        ):
            cached[original_name] = replace(reusable, original_name=original_name)
            write_resolution_cache(cache_path, cached.values())
            continue
        if current is not None and current.pubchem_cid is not None:
            continue
        names_to_lookup.append(original_name)

    def lookup_name(original_name: str) -> CompoundResolution:
        normalized_name = normalize_medical_name(original_name)
        attempted_at = _utc_now()
        try:
            cids = client.name_to_cids(original_name)
            if not cids:
                return CompoundResolution(
                    original_name,
                    normalized_name,
                    None,
                    None,
                    None,
                    ResolutionStatus.NOT_FOUND,
                    "PubChem exact full-name lookup returned no CIDs",
                    "[]",
                    attempted_at,
                )
            elif len(cids) > 1:
                return CompoundResolution(
                    original_name,
                    normalized_name,
                    None,
                    None,
                    None,
                    ResolutionStatus.AMBIGUOUS,
                    f"PubChem exact full-name lookup returned {len(cids)} CIDs; no candidate was selected",
                    json.dumps(cids, separators=(",", ":")),
                    attempted_at,
                )
            else:
                return CompoundResolution(
                    original_name,
                    normalized_name,
                    cids[0],
                    None,
                    None,
                    ResolutionStatus.PENDING_STRUCTURE,
                    None,
                    json.dumps(cids, separators=(",", ":")),
                    attempted_at,
                )
        except PubChemNotFoundError:
            return CompoundResolution(
                original_name,
                normalized_name,
                None,
                None,
                None,
                ResolutionStatus.NOT_FOUND,
                "PubChem returned HTTP 404 for the exact full-name lookup",
                "[]",
                attempted_at,
            )
        except (PubChemTransientError, PubChemPermanentError) as exc:
            logger.error("PubChem name resolution failed for %r: %s", original_name, exc)
            return CompoundResolution(
                original_name,
                normalized_name,
                None,
                None,
                None,
                ResolutionStatus.TRANSIENT_ERROR,
                str(exc),
                "[]",
                attempted_at,
            )
    with ThreadPoolExecutor(max_workers=name_lookup_workers) as executor:
        for completed, record in enumerate(
            executor.map(lookup_name, names_to_lookup), start=1
        ):
            cached[record.original_name] = record
            by_normalized[record.normalized_name] = record
            write_resolution_cache(cache_path, cached.values())
            if completed % 50 == 0 or completed == len(names_to_lookup):
                logger.info(
                    "PubChem new name resolution progress: %s/%s (cache already held %s)",
                    completed,
                    len(names_to_lookup),
                    len(unique_names) - len(names_to_lookup),
                )

    pending_by_cid: dict[int, list[str]] = {}
    for original_name in unique_names:
        record = cached[original_name]
        if record.pubchem_cid is not None and record.resolution_status in {
            ResolutionStatus.PENDING_STRUCTURE,
            ResolutionStatus.TRANSIENT_ERROR,
        }:
            pending_by_cid.setdefault(record.pubchem_cid, []).append(original_name)

    pending_cids = tuple(sorted(pending_by_cid))
    for offset in range(0, len(pending_cids), property_batch_size):
        batch = pending_cids[offset : offset + property_batch_size]
        attempted_at = _utc_now()
        try:
            properties = client.properties_for_cids(batch)
            for cid in batch:
                canonical, isomeric = properties.get(cid, (None, None))
                status = (
                    ResolutionStatus.RESOLVED
                    if canonical or isomeric
                    else ResolutionStatus.STRUCTURE_UNAVAILABLE
                )
                reason = None if status is ResolutionStatus.RESOLVED else "PubChem returned no SMILES structure for the CID"
                for original_name in pending_by_cid[cid]:
                    cached[original_name] = replace(
                        cached[original_name],
                        canonical_smiles=canonical,
                        isomeric_smiles=isomeric,
                        resolution_status=status,
                        failure_or_ambiguity_reason=reason,
                        attempted_at_utc=attempted_at,
                    )
        except (PubChemNotFoundError, PubChemTransientError, PubChemPermanentError) as exc:
            logger.error("PubChem property resolution failed for CID batch %s: %s", batch, exc)
            for cid in batch:
                for original_name in pending_by_cid[cid]:
                    cached[original_name] = replace(
                        cached[original_name],
                        resolution_status=ResolutionStatus.TRANSIENT_ERROR,
                        failure_or_ambiguity_reason=str(exc),
                        attempted_at_utc=attempted_at,
                    )
        write_resolution_cache(cache_path, cached.values())
        logger.info(
            "PubChem property resolution progress: %s/%s CIDs",
            min(offset + property_batch_size, len(pending_cids)),
            len(pending_cids),
        )

    return {name: cached[name] for name in unique_names}
