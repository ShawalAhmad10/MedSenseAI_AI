"""Run with python -m medsense_ai.sales_data.synthetic.cli generate --help."""

import argparse
import json
import logging
from pathlib import Path
from time import perf_counter

from .config import profile_config
from .generator import generate
from .qa import build_qa, require_default_acceptance
from .serialization import persist, verify_hashes

logger = logging.getLogger(__name__)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Generate synthetic_development commerce; no real/clinical data or ML.")
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("generate")
    command.add_argument("--profile", choices=("default", "smoke", "qa"), default="default")
    command.add_argument("--seed", type=int, default=260903)
    command.add_argument("--scenario", choices=("clean", "delayed", "outage", "unsupported_views"), default="clean")
    command.add_argument("--output-dir", type=Path, required=True)
    command.add_argument("--artifacts-dir", type=Path, required=True)
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    try:
        begin = perf_counter()
        config = profile_config(args.profile, master_seed=args.seed, scenario=args.scenario)
        logger.info("Generating profile=%s seed=%s scenario=%s version=%s", args.profile, args.seed, args.scenario, config.generator_version)
        result = generate(config)
        logger.info("Generated events=%s orders=%s; canonical/cart/inventory validation passed", len(result.dataset.events), len(result.dataset.orders))
        qa, timing = build_qa(result.dataset, config, result.generator_audit)
        if args.profile == "default" and args.scenario == "clean":
            require_default_acceptance(qa)
        if args.profile == "default" and not (30_000 <= qa["counts"]["sessions"] <= 70_000 and 100_000 <= qa["counts"]["commerce_events"] <= 300_000):
            logger.warning("Observed default counts are outside design expectations; no quota or seed selection applied")
        run = persist(result, config, qa, timing, args.output_dir, args.artifacts_dir)
        verify_hashes(args.output_dir, args.artifacts_dir)
        print(json.dumps(dict(status="passed", data_origin="synthetic_development", counts=qa["counts"], order_outcomes=qa["order_outcomes"], funnel_counts=[s["stage_count"] for s in qa["funnel_v1"]["stages"]], lead_positives=qa["lead_readiness"]["positives"], lead_negatives=qa["lead_readiness"]["negatives"], process_seconds=perf_counter()-begin, run=run), sort_keys=True))
        return 0
    except (ValueError, OSError) as exc:
        logger.error("Synthetic generation/QA failed: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
