from uuid import uuid4

from tests.test_api import client, token


def _headers(username: str, password: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token(username, password)}"}


def _create_served_order() -> int:
    waiter_headers = _headers("waiter", "waiter123")
    kitchen_headers = _headers("kitchen", "kitchen123")
    table = client.get("/tables", headers=waiter_headers).json()[0]
    item = client.get("/menu/items", headers=waiter_headers).json()[0]
    created = client.post(
        "/orders",
        headers=waiter_headers,
        json={
            "table_id": table["id"],
            "client_request_id": f"pos-{uuid4()}",
            "items": [{"menu_item_id": item["id"], "quantity": 1}],
        },
    )
    assert created.status_code == 201, created.text
    order_id = created.json()["id"]
    assert client.patch(f"/orders/{order_id}/status", headers=kitchen_headers, json={"status": "in_progress"}).status_code == 200
    assert client.patch(f"/orders/{order_id}/status", headers=kitchen_headers, json={"status": "ready"}).status_code == 200
    assert client.patch(f"/orders/{order_id}/status", headers=waiter_headers, json={"status": "served"}).status_code == 200
    return order_id


def _ensure_open_shift() -> int:
    manager_headers = _headers("manager", "manager123")
    current = client.get("/pos/shifts/current", headers=manager_headers)
    if current.status_code == 200:
        return current.json()["id"]
    opened = client.post("/pos/shifts/open", headers=manager_headers, json={"opening_cash_amount": "1000.00"})
    assert opened.status_code == 201, opened.text
    return opened.json()["id"]


def test_payment_discount_refund_and_shift_report_flow() -> None:
    shift_id = _ensure_open_shift()
    order_id = _create_served_order()
    manager_headers = _headers("manager", "manager123")
    waiter_headers = _headers("waiter", "waiter123")

    discount = client.post(
        f"/pos/orders/{order_id}/discounts",
        headers=manager_headers,
        json={"discount_type": "amount", "value": "100.00", "reason": "Service recovery"},
    )
    assert discount.status_code == 201, discount.text

    payment = client.post(
        f"/pos/orders/{order_id}/payments",
        headers=waiter_headers,
        json={"method": "cash", "amount_received": "10000.00", "tax_amount": "0.00", "service_fee_amount": "0.00"},
    )
    assert payment.status_code == 201, payment.text
    assert payment.json()["change_due"] > "0"

    refund = client.post(
        f"/pos/payments/{payment.json()['id']}/refunds",
        headers=manager_headers,
        json={"amount": "50.00", "reason": "Guest complaint"},
    )
    assert refund.status_code == 201, refund.text

    report = client.get(f"/pos/shifts/{shift_id}/report", headers=manager_headers)
    assert report.status_code == 200, report.text
    assert report.json()["orders_paid"] >= 1
    assert report.json()["refunds_total"] >= "50.00"


def test_payment_requires_open_shift() -> None:
    order_id = _create_served_order()
    waiter_headers = _headers("waiter", "waiter123")
    manager_headers = _headers("manager", "manager123")
    current = client.get("/pos/shifts/current", headers=manager_headers)
    if current.status_code == 200:
        client.post(
            f"/pos/shifts/{current.json()['id']}/close",
            headers=manager_headers,
            json={"closing_cash_amount": "0.00"},
        )

    payment = client.post(
        f"/pos/orders/{order_id}/payments",
        headers=waiter_headers,
        json={"method": "cash", "amount_received": "10000.00"},
    )

    assert payment.status_code == 409
