"""Training and local inference for the research binary DDI classifier."""

from medsense_ai.ddi_model.inference import DDIInferenceModel, UnsupportedDrugError

__all__ = ["DDIInferenceModel", "UnsupportedDrugError"]
