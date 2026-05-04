from fastapi.testclient import TestClient
from uuid import uuid4

from app.main import app
from app.seed import run as seed


client = TestClient(app)
seed()


def token(username: str, password: str) -> str:
    response = client.post("/auth/login", data={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_login_accepts_json() -> None:
    response = client.post("/auth/login", json={"username": "waiter", "password": "waiter123"})
    assert response.status_code == 200, response.text
    assert response.json()["token_type"] == "bearer"


def test_offline_sync_idempotency_receipt_and_analytics() -> None:
    waiter_token = token("waiter", "waiter123")
    kitchen_token = token("kitchen", "kitchen123")
    manager_token = token("manager", "manager123")
    waiter_headers = {"Authorization": f"Bearer {waiter_token}"}
    kitchen_headers = {"Authorization": f"Bearer {kitchen_token}"}
    manager_headers = {"Authorization": f"Bearer {manager_token}"}

    table = client.get("/tables", headers=waiter_headers).json()[0]
    item = client.get("/menu/items/barcode/460000000004", headers=waiter_headers).json()
    client_request_id = f"offline-{uuid4()}"
    payload = {
        "orders": [
            {
                "table_id": table["id"],
                "client_request_id": client_request_id,
                "source_device_id": "waiter-phone-1",
                "items": [{"menu_item_id": item["id"], "quantity": 1}],
            }
        ]
    }

    first_sync = client.post("/orders/sync", headers=waiter_headers, json=payload)
    assert first_sync.status_code == 200, first_sync.text
    assert first_sync.json()[0]["status"] == "created"
    order_id = first_sync.json()[0]["order"]["id"]

    second_sync = client.post("/orders/sync", headers=waiter_headers, json=payload)
    assert second_sync.status_code == 200, second_sync.text
    assert second_sync.json()[0]["status"] == "duplicate"
    assert second_sync.json()[0]["order"]["id"] == order_id

    for next_status, headers in [
        ("in_progress", kitchen_headers),
        ("ready", kitchen_headers),
        ("served", waiter_headers),
        ("paid", waiter_headers),
    ]:
        response = client.patch(f"/orders/{order_id}/status", headers=headers, json={"status": next_status})
        assert response.status_code == 200, response.text
        assert response.json()["status"] == next_status

    receipt = client.post(f"/peripherals/orders/{order_id}/receipt", headers=waiter_headers)
    assert receipt.status_code == 201, receipt.text
    assert receipt.json()["status"] == "queued"

    analytics = client.get("/analytics/summary", headers=manager_headers)
    assert analytics.status_code == 200, analytics.text
    assert "peak_hours" in analytics.json()
    assert "staff_productivity" in analytics.json()


def test_order_update_boards_and_table_overview() -> None:
    waiter_token = token("waiter", "waiter123")
    kitchen_token = token("kitchen", "kitchen123")
    manager_token = token("manager", "manager123")
    waiter_headers = {"Authorization": f"Bearer {waiter_token}"}
    kitchen_headers = {"Authorization": f"Bearer {kitchen_token}"}
    manager_headers = {"Authorization": f"Bearer {manager_token}"}

    menu_search = client.get("/menu/items", headers=waiter_headers, params={"q": "Americano", "available_only": True})
    assert menu_search.status_code == 200, menu_search.text
    americano = menu_search.json()[0]

    tables = client.get("/tables", headers=waiter_headers).json()
    target_table = tables[1]
    payload = {
        "table_id": target_table["id"],
        "client_request_id": f"editable-{uuid4()}",
        "items": [{"menu_item_id": americano["id"], "quantity": 1}],
    }
    created = client.post("/orders", headers=waiter_headers, json=payload)
    assert created.status_code == 201, created.text
    order_id = created.json()["id"]

    burger = client.get("/menu/items", headers=waiter_headers, params={"q": "Burger"}).json()[0]
    updated = client.patch(
        f"/orders/{order_id}",
        headers=waiter_headers,
        json={
            "priority": "urgent",
            "customer_note": "VIP guest",
            "items": [{"menu_item_id": burger["id"], "quantity": 1, "note": "medium"}],
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["priority"] == "urgent"
    assert updated.json()["customer_note"] == "VIP guest"
    assert updated.json()["items"][0]["menu_item_id"] == burger["id"]

    waiter_board = client.get("/orders/board/waiter", headers=waiter_headers)
    assert waiter_board.status_code == 200, waiter_board.text
    assert any(order["id"] == order_id for order in waiter_board.json()["active_orders"])

    kitchen_board = client.get("/orders/board/kitchen", headers=kitchen_headers)
    assert kitchen_board.status_code == 200, kitchen_board.text
    assert any(order["id"] == order_id for order in kitchen_board.json()["pending"])

    overview = client.get("/tables/overview", headers=manager_headers)
    assert overview.status_code == 200, overview.text
    assert any(table["active_order_id"] == order_id for table in overview.json())
