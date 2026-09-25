"""Real customer lead-scoring boundary for amnaMedcopy."""

import secrets

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Request,
)

from medsense_ai.integrations.amna_medcopy.lead_scoring import (
    PartnerLeadScoreRequest,
    PartnerRealLeadScoringService,
    load_production_lead_bundle,
)
from medsense_ai.lead_scoring.model.contracts import (
    LeadScoringResult,
)


def authorize(
    request: Request,
    x_medsense_key: str | None = Header(
        default=None
    ),
) -> None:
    key = (
        request.app.state.settings.integration_api_key
    )

    if key and (
        x_medsense_key is None
        or not secrets.compare_digest(
            key.get_secret_value(),
            x_medsense_key,
        )
    ):
        raise HTTPException(
            401,
            "Invalid integration credential",
        )


router = APIRouter(
    prefix="/integrations/amna/leads",
    tags=["amna-leads"],
    dependencies=[Depends(authorize)],
)


@router.post(
    "/score",
    response_model=LeadScoringResult,
)
def score_lead(
    payload: PartnerLeadScoreRequest,
    request: Request,
) -> LeadScoringResult:
    service = PartnerRealLeadScoringService(
        request.app.state.database,
        load_production_lead_bundle(),
    )

    try:
        return service.score(
            payload
        )
    except ValueError as exc:
        raise HTTPException(
            422,
            "Canonical real-customer lead input rejected",
        ) from exc
