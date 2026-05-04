from tests.test_api import client


def test_request_id_header_is_returned() -> None:
    response = client.get("/health", headers={"x-request-id": "test-request-id"})

    assert response.status_code == 200
    assert response.headers["x-request-id"] == "test-request-id"


def test_metrics_endpoint_exposes_request_counters() -> None:
    client.get("/health")
    response = client.get("/metrics")

    assert response.status_code == 200
    assert "flowpos_http_requests_total" in response.text
    assert 'path="/health"' in response.text
