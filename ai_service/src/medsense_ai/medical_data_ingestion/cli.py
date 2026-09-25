"""Administrative command-line entry points for medical-data ingestion."""

import argparse
import json
import logging
from pathlib import Path

from pydantic import ValidationError

from medsense_ai.config import Settings
from medsense_ai.database import Database
from medsense_ai.logging_config import configure_logging
from medsense_ai.medical_data_ingestion.rxnorm_cpc import (
    RxNormCpcIngestionFailure,
    RxNormCpcIngestionRequest,
    RxNormCpcIngestionService,
)

logger = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    """Build an argument parser with no implicit release or network behavior."""
    parser = argparse.ArgumentParser(
        description="Ingest identity data from an explicitly pinned local RxNorm CPC file."
    )
    parser.add_argument("--release", required=True, help="Exact monthly release identifier")
    parser.add_argument(
        "--source-path",
        required=True,
        type=Path,
        help="Local path to the extracted RXNCONSO.RRF file",
    )
    parser.add_argument(
        "--source-url",
        help="Official source release URL/reference to retain as provenance",
    )
    parser.add_argument(
        "--checksum",
        help="Expected md5:<hex> or sha256:<hex> checksum; mismatch stops ingestion",
    )
    return parser


def main() -> int:
    """Run the importer and emit exactly one structured JSON result."""
    args = build_parser().parse_args()
    settings = Settings()
    configure_logging(settings.log_level)
    try:
        request = RxNormCpcIngestionRequest(
            release_identifier=args.release,
            source_path=args.source_path,
            source_url=args.source_url,
            expected_checksum=args.checksum,
        )
    except ValidationError as exc:
        logger.error("Invalid RxNorm CPC ingestion request: %s", exc)
        return 2

    database = Database(settings.database_url)
    try:
        database.create_schema()
        service = RxNormCpcIngestionService(database)
        try:
            result = service.ingest(request)
        except RxNormCpcIngestionFailure as exc:
            print(json.dumps(exc.result.model_dump(mode="json"), sort_keys=True))
            return 1
        print(json.dumps(result.model_dump(mode="json"), sort_keys=True))
        return 0
    finally:
        database.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
