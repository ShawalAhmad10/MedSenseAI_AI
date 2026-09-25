"""Command-line entry point for the research DDI dataset builder."""

from __future__ import annotations

import argparse
import logging
from pathlib import Path
from typing import Sequence

from medsense_ai.ddi_training.pipeline import (
    DEFAULT_SEED,
    build_training_artifacts,
    load_positive_source,
)
from medsense_ai.ddi_training.pubchem import PubChemPUGClient, resolve_compounds


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("external/db_drug_interactions.csv"),
    )
    parser.add_argument(
        "--processed-dir", type=Path, default=Path("data/processed/ddi")
    )
    parser.add_argument("--artifacts-dir", type=Path, default=Path("artifacts/ddi"))
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--requests-per-second", type=float, default=4.0)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    source = load_positive_source(args.source)
    cache_path = args.artifacts_dir / "pubchem_compound_cache.csv"
    resolutions = resolve_compounds(
        source.drug_names,
        cache_path=cache_path,
        client=PubChemPUGClient(requests_per_second=args.requests_per_second),
    )
    report = build_training_artifacts(
        source_path=args.source,
        source=source,
        resolutions=resolutions,
        cache_path=cache_path,
        processed_dir=args.processed_dir,
        artifacts_dir=args.artifacts_dir,
        seed=args.seed,
    )
    logging.getLogger(__name__).info("DDI dataset build complete: %s", report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
