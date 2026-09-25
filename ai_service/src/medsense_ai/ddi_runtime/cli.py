"""Local CLI for the offline MedSenseAI runtime DDI warning service."""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from typing import Sequence

from medsense_ai.ddi_runtime.service import RuntimeDDIService


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ingredient-a", required=True)
    parser.add_argument("--ingredient-b", required=True)
    parser.add_argument("--model-dir", type=Path, default=Path("artifacts/ddi/model"))
    parser.add_argument(
        "--known-source",
        type=Path,
        default=Path("external/db_drug_interactions.csv"),
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    service = RuntimeDDIService(
        model_dir=args.model_dir,
        known_interaction_source=args.known_source,
    )
    result = service.predict(args.ingredient_a, args.ingredient_b)
    print(json.dumps(result.model_dump(mode="json"), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
