"""Build canonical lead artifacts without training or importing synthetic internals."""

import argparse
import json
import logging
from pathlib import Path
from time import perf_counter

from .contracts import BuildConfig
from .dataset import build_dataset
from .io import load_canonical, verify_artifacts, write_artifacts, write_run_metadata
from .qa import audit_dataset

logger = logging.getLogger(__name__)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Point-in-time lead dataset construction; no estimator/preprocessing fitting.")
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("build")
    command.add_argument("--source-dir", type=Path, required=True)
    command.add_argument("--source-hashes", type=Path, required=True)
    command.add_argument("--output-dir", type=Path, required=True)
    command.add_argument("--artifacts-dir", type=Path, required=True)
    command.add_argument("--observation-start")
    command.add_argument("--observation-end")
    command.add_argument("--customer-limit", type=int)
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    try:
        begin = perf_counter()
        options = {name: getattr(args, name) for name in ("observation_start", "observation_end", "customer_limit") if getattr(args, name) is not None}
        config = BuildConfig(**options)
        validated, provenance = load_canonical(args.source_dir, args.source_hashes)
        times = {"load_validation_seconds": perf_counter()-begin}
        logger.info("Canonical source hashes and validation passed: %s", provenance["dataset_id"])
        started = perf_counter()
        built = build_dataset(validated, config)
        times.update(built.timings)
        times["total_dataset_build_seconds"] = perf_counter()-started
        logger.info("Built %s candidate snapshots; auditing sources and splits", len(built.examples))
        started = perf_counter()
        report, leakage = audit_dataset(built, validated)
        times["qa_seconds"] = perf_counter()-started
        if config == BuildConfig() and not report["all_splits_have_both_classes"]:
            raise ValueError("Full build needs mature examples of both classes in every split; source/config were not adjusted")
        started = perf_counter()
        write_artifacts(built, validated, report, leakage, provenance, args.output_dir, args.artifacts_dir)
        verify_artifacts(args.output_dir, args.artifacts_dir)
        times["serialization_verification_seconds"] = perf_counter()-started
        times["total_seconds"] = perf_counter()-begin
        write_run_metadata(args.artifacts_dir, times)
        print(json.dumps(dict(status="passed", counts=report["counts"], splits=report["splits"], customer_overlap=report["customer_overlap"], timings=times), sort_keys=True))
        return 0
    except (ValueError, OSError, KeyError) as exc:
        logger.error("Lead dataset build failed: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
