from datetime import datetime, timezone

from medsense_ai.database import Database
from medsense_ai.integrations.amna_medcopy.lead_scoring import (
    PartnerLeadScoreRequest,
    PartnerRealLeadScoringService,
)
from medsense_ai.sales_analytics.live import (
    LiveEvent,
    ingest_event,
)


UTC = timezone.utc


def test_real_partner_adapter_fails_closed_without_coverage(
    tmp_path,
):
    database = Database(
        f"sqlite:///{tmp_path / 'lead-real.db'}"
    )
    database.create_schema()

    try:
        ingest_event(
            database,
            LiveEvent(
                event_id="real-view-1",
                event_name="product_viewed",
                session_id="session-1",
                cart_id="cart-1",
                customer_id="2",
                occurred_at=datetime(
                    2026,
                    9,
                    17,
                    10,
                    0,
                    tzinfo=UTC,
                ),
                data_origin="partner_real",
                product_ids=(900014,),
            ),
            now=datetime(
                2026,
                9,
                17,
                10,
                1,
                tzinfo=UTC,
            ),
        )

        request = PartnerLeadScoreRequest(
            customer={
                "customer_id": 2,
                "created_at":
                    "2026-09-01T00:00:00Z",
            },
            orders=(
                {
                    "order_id": 9,
                    "customer_id": 2,
                    "created_at":
                        "2026-09-16T20:06:53.651Z",
                },
            ),
        )

        service = PartnerRealLeadScoringService(
            database,
            bundle=None,
        )

        result = service.score(
            request,
            at=datetime(
                2026,
                9,
                17,
                10,
                2,
                tzinfo=UTC,
            ),
        )

        assert (
            result.status.value
            == "insufficient_data"
        )
        assert (
            result.reason
            == "historical_coverage_or_availability"
        )
        assert result.lead_score is None

    finally:
        database.dispose()
