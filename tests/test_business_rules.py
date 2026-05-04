from uuid import uuid4

from tests.test_api import client, token


def _headers(username: str, password: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token(username, password)}"}


def _create_waiter_order() -> int:
    waiter_headers = _headers("waiter", "waiter123")
    table = client.get("/tables", headers=waiter_headers).json()[0]
    item = client.get("/menu/items", headers=waiter_headers).json()[0]
    response = client.post(
        "/orders",
        headers=waiter_headers,
        json={
            "table_id": table["id"],
            "client_request_id": f"business-rule-{uuid4()}",
            "items": [{"menu_item_id": item["id"], "quantity": 1}],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_invalid_order_transition_is_rejected() -> None:
    order_id = _create_waiter_order()
    waiter_headers = _headers("waiter", "waiter123")

    response = client.patch(f"/orders/{order_id}/status", headers=waiter_headers, json={"status": "paid"})

    assert response.status_code == 409


def test_kitchen_cannot_set_waiter_only_status() -> None:
    order_id = _create_waiter_order()
    kitchen_headers = _headers("kitchen", "kitchen123")

    response = client.patch(f"/orders/{order_id}/status", headers=kitchen_headers, json={"status": "served"})

    assert response.status_code == 403


def test_waiter_cannot_read_manager_analytics() -> None:
    waiter_headers = _headers("waiter", "waiter123")

    response = client.get("/analytics/summary", headers=waiter_headers)

    assert response.status_code == 403


def test_websocket_orders_connection_acknowledges_group() -> None:
    waiter_token = token("waiter", "waiter123")

    with client.websocket_connect(f"/ws/orders?token={waiter_token}") as websocket:
        message = websocket.receive_json()

    assert message["type"] == "connected"
    assert message["group"].startswith("waiter:")
