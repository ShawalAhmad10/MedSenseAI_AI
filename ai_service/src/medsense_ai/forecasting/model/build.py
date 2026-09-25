"""Run the frozen two-method forecast experiment from FORECAST-01 artifacts."""

import json
from pathlib import Path

from .data import FrozenForecastSource
from .training import run_training

FORECAST_DATASET_MANIFEST_SHA256 = "e98771edad6e86b6b8fedc81041f0e162a93b3a7af9b8aa7461007a408929dcc"


def build_default(root: Path) -> dict:
    root = Path(root).resolve()
    source = FrozenForecastSource(
        root / "data/processed/sales/forecast/v1/default_260903",
        root / "artifacts/sales/forecast/v1/default_260903",
        FORECAST_DATASET_MANIFEST_SHA256,
    )
    return run_training(source, root / "artifacts/sales/forecast/model/v1/default_260903")


def main():
    result = build_default(Path(__file__).resolve().parents[4])
    print(json.dumps({
        "status": result["status"],
        "selected_method": result["selected_method"],
        "selection_reason": result["selection_reason"],
        "bundle_manifest_sha256": result["bundle_manifest_sha256"],
    }, sort_keys=True))


if __name__ == "__main__":
    main()

