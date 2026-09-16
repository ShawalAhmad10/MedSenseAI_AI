"""Synthetic nonclinical events exercise the actual persistent ingestion contract."""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
import pytest

from medsense_ai.config import Settings
from medsense_ai.main import create_app
from medsense_ai.sales_analytics.live import LiveEventName

PATH = '/api/v1/integrations/amna/funnel'


def event(index=0, session='test-session', cart='test-cart', origin='partner_real'):
    name = list(LiveEventName)[index].value
    return dict(event_id=f'{session}:{cart}:{index}', event_name=name,
        session_id=session, cart_id=cart, occurred_at=f'2026-09-01T12:00:0{index}Z',
        data_origin=origin, product_ids=[1], quantity=1 if index == 1 else None,
        order_id='TEST-order-1' if index == 3 else None)


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(Settings(environment='test', database_url=f'sqlite:///{tmp_path}/funnel.db'))) as value:
        yield value


def test_empty_metrics_are_zero_and_undefined_conversions(client):
    response = client.get(PATH + '/metrics')
    assert response.status_code == 200
    data = response.json()
    assert data['total_events'] == 0
    assert data['overall_conversion_pct'] is None
    assert [row['sessions'] for row in data['stages']] == [0] * 4


def test_ingestion_idempotency_and_conflicting_id(client):
    assert client.post(PATH + '/events', json=event()).json()['duplicate'] is False
    assert client.post(PATH + '/events', json=event()).json()['duplicate'] is True
    assert client.post(PATH + '/events', json={**event(), 'product_ids': [2]}).status_code == 409
    assert client.get(PATH + '/metrics').json()['total_events'] == 1


@pytest.mark.parametrize('changes', [
    {'event_name':'ORDER_COMPLETED'}, {'product_ids':['prod-1']}, {'product_ids':[True]},
    {'product_ids':[]}, {'product_ids':[1,1]}, {'quantity':1}, {'order_id':'fake'},
    {'event_id':' '}, {'occurred_at':'2026-09-01'}, {'secret':'not-allowed'},
    {'occurred_at':(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()},
    {'data_origin':'unknown'},
])
def test_malformed_events_rejected(client, changes):
    assert client.post(PATH + '/events', json={**event(), **changes}).status_code == 422


def test_ordered_sessions_and_demo_separation(client):
    for index in range(4):
        assert client.post(PATH + '/events', json=event(index)).status_code == 200
    client.post(PATH + '/events', json=event(session='abandoned'))
    for index in range(4):
        client.post(PATH + '/events', json=event(index, session='DEMO', origin='synthetic_development'))
    data = client.get(PATH + '/metrics').json()
    assert data['total_events'] == 5
    assert [row['sessions'] for row in data['stages']] == [2,1,1,1]
    assert data['overall_conversion_pct'] == 50
    assert client.get(PATH + '/metrics?origin=synthetic_development').json()['total_events'] == 4


def test_never_join_different_carts_or_out_of_order_events(client):
    client.post(PATH + '/events', json=event(0))
    client.post(PATH + '/events', json=event(1, cart='other'))
    client.post(PATH + '/events', json=event(2))
    client.post(PATH + '/events', json=event(3))
    assert [row['sessions'] for row in client.get(PATH + '/metrics').json()['stages']] == [1,0,0,0]


def test_reverse_arrival_order_still_uses_occurrence_time(client):
    for index in reversed(range(4)):
        client.post(PATH + '/events', json=event(index))
    assert [row['sessions'] for row in client.get(PATH + '/metrics').json()['stages']] == [1,1,1,1]


def test_database_survives_application_restart_and_authentication(tmp_path):
    settings = Settings(environment='test', database_url=f'sqlite:///{tmp_path}/persistent.db', integration_api_key='test-only-fixture')
    headers = {'x-medsense-key':'test-only-fixture'}
    with TestClient(create_app(settings)) as first:
        assert first.post(PATH + '/events', json=event()).status_code == 401
        assert first.post(PATH + '/events', json=event(), headers=headers).status_code == 200
    with TestClient(create_app(settings)) as second:
        assert second.get(PATH + '/metrics', headers=headers).json()['total_events'] == 1
