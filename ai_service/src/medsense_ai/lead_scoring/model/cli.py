"""Explicit local training/scoring commands, with no HTTP or partner integration."""

import argparse
import json
import logging
from pathlib import Path

from .data import FrozenSource
from .inference import score_local
from .training import run_training


def main(argv=None) -> int:
    parser=argparse.ArgumentParser(description="Bounded synthetic-development lead model")
    commands=parser.add_subparsers(dest="command",required=True)
    train=commands.add_parser("train")
    for flag in ("data-dir","artifacts-dir","output-dir"):
        train.add_argument("--"+flag,type=Path,required=True)
    train.add_argument("--expected-source-hash",required=True)
    score=commands.add_parser("score")
    score.add_argument("--bundle-dir",type=Path,required=True)
    score.add_argument("--expected-bundle-hash",required=True)
    score.add_argument("--input",type=Path,required=True)
    args=parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO,format="%(levelname)s %(name)s %(message)s")
    try:
        if args.command=="train":
            source=FrozenSource(args.data_dir,args.artifacts_dir,args.expected_source_hash)
            result=run_training(source,args.output_dir)
            print(json.dumps({k:v for k,v in result.items() if k not in ("test","validation")},sort_keys=True))
            return 0
        result=score_local(args.bundle_dir,args.expected_bundle_hash,json.loads(args.input.read_text(encoding="utf-8")))
        print(result.model_dump_json())
        return 0 if result.status=="scored" else 1
    except (ValueError,OSError,KeyError) as exc:
        logging.getLogger(__name__).error("Lead model command failed: %s",exc)
        return 1


if __name__=="__main__":
    raise SystemExit(main())
