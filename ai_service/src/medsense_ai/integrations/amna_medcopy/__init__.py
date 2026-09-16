"""Authoritative amnaMedcopy backend-domain adapters."""

from medsense_ai.integrations.amna_medcopy.contracts import (
    PartnerProductAdaptation,
    PartnerProductProvenance,
    PartnerProductRecord,
)
from medsense_ai.integrations.amna_medcopy.product_adapter import (
    PartnerProductAdaptationError,
    adapt_partner_product,
)
from medsense_ai.integrations.amna_medcopy.cart_ddi import (
    CartDDIStatus,
    PartnerCartCheckRequest,
    PartnerCartCheckResponse,
    PartnerCartDDIService,
)
from medsense_ai.integrations.amna_medcopy.ddi_bridge import (
    ExactDDIIngredientResolver,
    IngredientResolutionState,
    ResolvedDDIIngredient,
)

__all__ = [
    "CartDDIStatus",
    "ExactDDIIngredientResolver",
    "IngredientResolutionState",
    "PartnerCartCheckRequest",
    "PartnerCartCheckResponse",
    "PartnerCartDDIService",
    "PartnerProductAdaptation",
    "PartnerProductAdaptationError",
    "PartnerProductProvenance",
    "PartnerProductRecord",
    "ResolvedDDIIngredient",
    "adapt_partner_product",
]
