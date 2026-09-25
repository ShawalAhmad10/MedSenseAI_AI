"""Train/evaluate or locally run the saved MedSenseAI research DDI model."""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from typing import Sequence

from medsense_ai.ddi_model.inference import DDIInferenceModel
from medsense_ai.ddi_model.training import DEFAULT_SEED, train_evaluate_select


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    train = subparsers.add_parser("train", help="validate TRAIN-01, train, evaluate, and save")
    train.add_argument("--data-dir", type=Path, default=Path("data/processed/ddi"))
    train.add_argument("--provenance-dir", type=Path, default=Path("artifacts/ddi"))
    train.add_argument("--model-dir", type=Path, default=Path("artifacts/ddi/model"))
    train.add_argument("--seed", type=int, default=DEFAULT_SEED)
    infer = subparsers.add_parser("infer", help="load the selected model and score one pair")
    infer.add_argument("--model-dir", type=Path, default=Path("artifacts/ddi/model"))
    infer.add_argument("--drug-a", required=True)
    infer.add_argument("--drug-b", required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if args.command == "train":
        result = train_evaluate_select(
            data_dir=args.data_dir,
            provenance_dir=args.provenance_dir,
            model_dir=args.model_dir,
            seed=args.seed,
        )
    else:
        result = DDIInferenceModel(args.model_dir).predict(
            args.drug_a, args.drug_b
        ).to_dict()
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
