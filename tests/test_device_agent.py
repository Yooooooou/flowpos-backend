from uuid import uuid4

from tests.test_api import client, token


def _manager_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {token('manager', 'manager123')}"}


def test_device_agent_claims_and_completes_print_job() -> None:
    headers = _manager_headers()
    device = client.post(
        "/peripherals/devices",
        headers=headers,
        json={
            "name": f"Agent printer {uuid4()}",
            "device_type": "receipt_printer",
            "identifier": f"agent-printer-{uuid4()}",
        },
    ).json()
    job = client.post(
        "/peripherals/jobs",
        headers=headers,
        json={"device_id": device["id"], "job_type": "receipt", "payload": {"hello": "world"}},
    )
    assert job.status_code == 201, job.text

    token_response = client.post(
        "/peripherals/agent-tokens",
        headers=headers,
        json={"device_id": device["id"], "name": "test-agent"},
    )
    assert token_response.status_code == 201, token_response.text
    agent_token = token_response.json()["token"]

    claim = client.post(
        "/peripherals/agent/jobs/claim",
        headers={"X-Device-Agent-Token": agent_token},
        json={"lease_seconds": 60},
    )
    assert claim.status_code == 200, claim.text
    assert claim.json()["job"]["id"] == job.json()["id"]

    completed = client.patch(
        f"/peripherals/agent/jobs/{job.json()['id']}",
        headers={
            "X-Device-Agent-Token": agent_token,
            "X-Job-Lease-Token": claim.json()["lease_token"],
        },
        json={"status": "completed"},
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["status"] == "completed"


def test_device_agent_rejects_staff_jwt() -> None:
    headers = _manager_headers()
    response = client.post(
        "/peripherals/agent/jobs/claim",
        headers={"X-Device-Agent-Token": headers["Authorization"].removeprefix("Bearer ")},
        json={"lease_seconds": 60},
    )

    assert response.status_code == 401
