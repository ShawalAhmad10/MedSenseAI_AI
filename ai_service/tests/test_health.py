"""Health API tests."""

from fastapi.testclient import TestClient


def test_health_check_reports_database_availability(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "database": "available"}


def test_health_check_fails_closed_when_database_is_unavailable(
    client: TestClient,
    monkeypatch,
) -> None:
    monkeypatch.setattr(client.app.state.database, "is_healthy", lambda: False)

    response = client.get("/api/v1/health")

    assert response.status_code == 503
    assert response.json() == {"status": "unhealthy", "database": "unavailable"}
