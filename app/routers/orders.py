from datetime import datetime, timezone, date, time
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db.session import get_db
from app.deps import get_current_user
from app.models import (
    CafeTable,
    MenuItem,
    Order,
    OrderDiscount,
    OrderEvent,
    OrderItem,
    OrderPriority,
    OrderStatus,
    Payment,
    TableStatus,
    User,
    UserRole,
)
from app.realtime import manager as websocket_manager
from app.schemas import (
    DashboardMetric,
    KitchenBoardResponse,
    OrderCreate,
    OrderItemStatusUpdate,
    OrderRead,
    OrderStatusUpdate,
    OrderSyncRequest,
    TableSplitRequest,
    OrderSyncResult,
    OrderUpdate,
    TableOverview,
    WaiterDashboardResponse,
)

router = APIRouter(prefix="/orders", tags=["orders"])

ACTIVE_STATUSES = {OrderStatus.pending, OrderStatus.in_progress, OrderStatus.ready, OrderStatus.served}
FINAL_STATUSES = {OrderStatus.paid, OrderStatus.cancelled}
TRANSITIONS = {
    OrderStatus.pending: {OrderStatus.in_progress, OrderStatus.cancelled},
    OrderStatus.in_progress: {OrderStatus.ready, OrderStatus.cancelled},
    OrderStatus.ready: {OrderStatus.served, OrderStatus.cancelled},
    OrderStatus.served: {OrderStatus.paid, OrderStatus.cancelled},
    OrderStatus.paid: set(),
    OrderStatus.cancelled: set(),
}


def _order_stmt():
    return (
        select(Order)
        .options(
            selectinload(Order.table),
            selectinload(Order.waiter),
            selectinload(Order.items).selectinload(OrderItem.menu_item).selectinload(MenuItem.category),
            selectinload(Order.events),
            selectinload(Order.payment),
        )
        .order_by(Order.created_at.desc())
    )


def _can_manage_order(current_user: User, order: Order) -> bool:
    if current_user.role == UserRole.manager:
        return True
    return current_user.role == UserRole.waiter and order.waiter_id == current_user.id


def _rebuild_items(order: Order, items_payload: list, db: Session) -> None:
    order.items.clear()
    total = Decimal("0.00")
    for item_payload in items_payload:
        menu_item = db.get(MenuItem, item_payload.menu_item_id)
        if menu_item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Menu item {item_payload.menu_item_id} not found")
        if not menu_item.is_available:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"{menu_item.name} is unavailable")
        line_total = Decimal(menu_item.price) * item_payload.quantity
        total += line_total
        order.items.append(
            OrderItem(
                menu_item_id=menu_item.id,
                quantity=item_payload.quantity,
                unit_price=menu_item.price,
                line_total=line_total,
                note=item_payload.note,
            )
        )
    order.total_amount = total


def _event(order: Order, actor: User | None, event_type: str, message: str | None = None) -> OrderEvent:
    return OrderEvent(
        order=order,
        actor_id=actor.id if actor else None,
        event_type=event_type,
        from_status=None,
        to_status=order.status,
        message=message,
    )


async def _broadcast_order(event_type: str, order: Order) -> None:
    await websocket_manager.publish(
        ["manager", "kitchen", f"waiter:{order.waiter_id}"],
        {
            "type": event_type,
            "order_id": order.id,
            "status": order.status.value,
            "table_id": order.table_id,
            "waiter_id": order.waiter_id,
            "priority": order.priority.value,
            "total_amount": str(order.total_amount),
            "order": OrderRead.model_validate(order).model_dump(mode="json"),
        },
    )


def _create_order_record(payload: OrderCreate, db: Session, current_user: User) -> tuple[Order, bool]:
    if current_user.role not in {UserRole.waiter, UserRole.manager}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only waiter or manager can create orders")

    if payload.client_request_id:
        existing = db.scalar(
            _order_stmt().where(
                Order.waiter_id == current_user.id,
                Order.client_request_id == payload.client_request_id,
            )
        )
        if existing is not None:
            return existing, False

    table = db.get(CafeTable, payload.table_id)
    if table is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")

    order = Order(
        table_id=payload.table_id,
        waiter_id=current_user.id,
        client_request_id=payload.client_request_id,
        source_device_id=payload.source_device_id,
        priority=payload.priority,
        customer_note=payload.customer_note,
        status=OrderStatus.pending,
    )
    _rebuild_items(order, payload.items, db)
    table.status = TableStatus.occupied
    db.add(order)
    db.flush()
    db.add(_event(order, current_user, "order.created", "Order sent to kitchen"))
    db.commit()
    created_order = db.scalar(_order_stmt().where(Order.id == order.id))
    return created_order, True


@router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
async def create_order(
    payload: OrderCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Order:
    if idempotency_key and payload.client_request_id is None:
        payload = payload.model_copy(update={"client_request_id": idempotency_key})
    order, created = _create_order_record(payload, db, current_user)
    if created:
        await _broadcast_order("order.created", order)
    return order


@router.post("/sync", response_model=list[OrderSyncResult])
async def sync_orders(
    payload: OrderSyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[OrderSyncResult]:
    results: list[OrderSyncResult] = []
    for order_payload in payload.orders:
        try:
            order, created = _create_order_record(order_payload, db, current_user)
            if created:
                await _broadcast_order("order.created", order)
            results.append(
                OrderSyncResult(
                    client_request_id=order_payload.client_request_id,
                    status="created" if created else "duplicate",
                    order=order,
                )
            )
        except HTTPException as exc:
            db.rollback()
            results.append(
                OrderSyncResult(
                    client_request_id=order_payload.client_request_id,
                    status="failed",
                    error=str(exc.detail),
                )
            )
    return results


@router.get("", response_model=list[OrderRead])
def list_orders(
    only_active: bool = Query(default=False),
    status_filter: OrderStatus | None = Query(default=None, alias="status"),
    priority: OrderPriority | None = None,
    table_id: int | None = None,
    waiter_id: int | None = None,
    q: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    include_completed: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Order]:
    stmt = _order_stmt()
    if current_user.role == UserRole.waiter:
        stmt = stmt.where(Order.waiter_id == current_user.id)
    elif current_user.role == UserRole.kitchen:
        if include_completed:
            stmt = stmt.where(
                (Order.ready_at.isnot(None)) | (Order.status == OrderStatus.cancelled)
            )
        else:
            stmt = stmt.where(Order.status.in_([OrderStatus.pending, OrderStatus.in_progress, OrderStatus.ready]))
    if only_active:
        stmt = stmt.where(Order.status.in_(list(ACTIVE_STATUSES)))
    if status_filter is not None:
        stmt = stmt.where(Order.status == status_filter)
    if priority is not None:
        stmt = stmt.where(Order.priority == priority)
    if table_id is not None:
        stmt = stmt.where(Order.table_id == table_id)
    if waiter_id is not None and current_user.role == UserRole.manager:
        stmt = stmt.where(Order.waiter_id == waiter_id)
    if q:
        stmt = stmt.join(Order.table).where(
            Order.customer_note.ilike(f"%{q.strip()}%") | CafeTable.number.ilike(f"%{q.strip()}%")
        )
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
            stmt = stmt.where(Order.created_at >= dt_from)
        except ValueError:
            pass
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to)
            dt_to = dt_to.replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
            stmt = stmt.where(Order.created_at <= dt_to)
        except ValueError:
            pass
    stmt = stmt.limit(limit).offset(offset)
    return list(db.scalars(stmt))


@router.get("/board/kitchen", response_model=KitchenBoardResponse)
def kitchen_board(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> KitchenBoardResponse:
    if current_user.role not in {UserRole.kitchen, UserRole.manager}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Kitchen board is not available")
    orders = list(
        db.scalars(
            _order_stmt().where(Order.status.in_([OrderStatus.pending, OrderStatus.in_progress, OrderStatus.ready]))
        )
    )
    pending = [order for order in orders if order.status == OrderStatus.pending]
    in_progress = [order for order in orders if order.status == OrderStatus.in_progress]
    ready = [order for order in orders if order.status == OrderStatus.ready]
    today_start = datetime.combine(date.today(), time.min, tzinfo=timezone.utc)
    ready_today = db.scalar(select(func.count(Order.id)).where(Order.ready_at >= today_start)) or 0
    metrics = [
        DashboardMetric(key="pending", label="Pending", value=len(pending)),
        DashboardMetric(key="in_progress", label="In Progress", value=len(in_progress)),
        DashboardMetric(key="ready", label="Ready", value=len(ready)),
        DashboardMetric(key="ready_today", label="Готово сегодня", value=ready_today),
    ]
    return KitchenBoardResponse(pending=pending, in_progress=in_progress, ready=ready, metrics=metrics)


@router.get("/board/waiter", response_model=WaiterDashboardResponse)
def waiter_board(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WaiterDashboardResponse:
    if current_user.role not in {UserRole.waiter, UserRole.manager}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Waiter board is not available")
    stmt = _order_stmt().where(Order.status.in_(list(ACTIVE_STATUSES)))
    if current_user.role == UserRole.waiter:
        stmt = stmt.where(Order.waiter_id == current_user.id)
    active_orders = list(db.scalars(stmt))
    ready_orders = [order for order in active_orders if order.status == OrderStatus.ready]

    occupied_tables: list[TableOverview] = []
    seen_tables: set[int] = set()
    for order in active_orders:
        if order.table_id in seen_tables:
            continue
        seen_tables.add(order.table_id)
        occupied_tables.append(
            TableOverview(
                id=order.table.id,
                number=order.table.number,
                seats=order.table.seats,
                status=order.table.status,
                location=order.table.location,
                active_order_id=order.id,
                active_order_status=order.status,
                active_order_total=order.total_amount,
                active_waiter_name=order.waiter.full_name if order.waiter else None,
            )
        )
    metrics = [
        DashboardMetric(key="active_orders", label="Active Orders", value=len(active_orders)),
        DashboardMetric(key="ready_orders", label="Ready Orders", value=len(ready_orders)),
        DashboardMetric(key="occupied_tables", label="Occupied Tables", value=len(occupied_tables)),
    ]
    return WaiterDashboardResponse(
        active_orders=active_orders,
        ready_orders=ready_orders,
        occupied_tables=occupied_tables,
        metrics=metrics,
    )


@router.get("/{order_id}", response_model=OrderRead)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Order:
    order = db.scalar(_order_stmt().where(Order.id == order_id))
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if current_user.role == UserRole.waiter and order.waiter_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot access another waiter's order")
    return order


@router.patch("/{order_id}", response_model=OrderRead)
async def update_order(
    order_id: int,
    payload: OrderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Order:
    order = db.scalar(_order_stmt().where(Order.id == order_id))
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if not _can_manage_order(current_user, order):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot edit this order")

    data = payload.model_dump(exclude_unset=True)

    if "waiter_id" in data:
        if current_user.role != UserRole.manager:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only manager can reassign waiter")
        if order.status in FINAL_STATUSES:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot reassign waiter on finalized order")
        new_waiter = db.get(User, data.pop("waiter_id"))
        if new_waiter is None or new_waiter.role != UserRole.waiter:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Waiter not found")
        order.waiter_id = new_waiter.id

    if data and order.status not in {OrderStatus.pending, OrderStatus.in_progress}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Order can no longer be edited")

    if "table_id" in data:
        new_table = db.get(CafeTable, data["table_id"])
        if new_table is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
        old_table = order.table
        order.table_id = new_table.id
        new_table.status = TableStatus.occupied
        still_active_on_old = db.scalar(
            select(Order)
            .where(
                Order.table_id == old_table.id,
                Order.id != order.id,
                Order.status.in_(list(ACTIVE_STATUSES)),
            )
            .limit(1)
        )
        if still_active_on_old is None:
            old_table.status = TableStatus.free
    if "priority" in data:
        order.priority = data["priority"]
    if "customer_note" in data:
        order.customer_note = data["customer_note"]
    if "items" in data and data["items"] is not None:
        _rebuild_items(order, payload.items, db)

    db.add(
        OrderEvent(
            order=order,
            actor_id=current_user.id,
            event_type="order.updated",
            from_status=order.status,
            to_status=order.status,
            message="Order details updated",
        )
    )
    db.commit()
    order = db.scalar(_order_stmt().where(Order.id == order.id))
    await _broadcast_order("order.updated", order)
    return order


@router.patch("/{order_id}/status", response_model=OrderRead)
async def update_order_status(
    order_id: int,
    payload: OrderStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Order:
    order = db.scalar(_order_stmt().where(Order.id == order_id))
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if current_user.role == UserRole.waiter and order.waiter_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot update another waiter's order")
    if current_user.role == UserRole.kitchen and payload.status not in {
        OrderStatus.in_progress,
        OrderStatus.ready,
        OrderStatus.cancelled,
    }:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Kitchen cannot set this status")
    if current_user.role == UserRole.waiter and payload.status not in {OrderStatus.served, OrderStatus.paid, OrderStatus.cancelled}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Waiter cannot set this status")

    if current_user.role != UserRole.manager and payload.status not in TRANSITIONS[order.status]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invalid transition from {order.status.value} to {payload.status.value}",
        )

    previous_status = order.status
    order.status = payload.status
    now = datetime.now(timezone.utc)
    if payload.status == OrderStatus.ready and order.ready_at is None:
        order.ready_at = now
    if payload.status == OrderStatus.served and order.served_at is None:
        order.served_at = now
    if payload.status == OrderStatus.served:
        for item in order.items:
            item.status = "served"
    if payload.status == OrderStatus.paid:
        order.paid_at = now
    if payload.status in (OrderStatus.paid, OrderStatus.cancelled):
        others_active = db.scalar(
            select(func.count(Order.id)).where(
                Order.table_id == order.table_id,
                Order.id != order.id,
                Order.status.not_in([OrderStatus.paid, OrderStatus.cancelled]),
            )
        )
        if not others_active:
            order.table.status = TableStatus.free

    db.add(
        OrderEvent(
            order=order,
            actor_id=current_user.id,
            event_type="order.status_changed",
            from_status=previous_status,
            to_status=payload.status,
            message=payload.message,
        )
    )
    db.commit()
    order = db.scalar(_order_stmt().where(Order.id == order.id))
    await _broadcast_order("order.status_changed", order)
    return order


@router.post("/{order_id}/cancel", response_model=OrderRead)
async def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Order:
    return await update_order_status(
        order_id,
        OrderStatusUpdate(status=OrderStatus.cancelled, message="Order cancelled"),
        db,
        current_user,
    )


@router.post("/split-table", response_model=list[OrderRead])
async def split_table_orders(
    payload: TableSplitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Order]:
    if current_user.role not in {UserRole.waiter, UserRole.manager}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    active_orders = list(db.scalars(
        _order_stmt().where(
            Order.table_id == payload.table_id,
            Order.status.not_in([OrderStatus.paid, OrderStatus.cancelled]),
        )
    ))
    if not active_orders:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active orders for this table")

    item_map: dict[int, OrderItem] = {i.id: i for o in active_orders for i in o.items}

    qty_totals: dict[int, int] = {}
    for split in payload.splits:
        for si in split.items:
            if si.order_item_id not in item_map:
                raise HTTPException(status_code=400, detail=f"Item {si.order_item_id} not in active orders")
            qty_totals[si.order_item_id] = qty_totals.get(si.order_item_id, 0) + si.quantity
    for item_id, total in qty_totals.items():
        if total != item_map[item_id].quantity:
            raise HTTPException(status_code=400, detail=f"Quantities for item {item_id} must sum to {item_map[item_id].quantity}")

    first = active_orders[0]
    new_orders: list[Order] = []

    for split_def in payload.splits:
        if not split_def.items:
            continue
        new_order = Order(
            table_id=payload.table_id,
            waiter_id=first.waiter_id,
            status=first.status,
            priority=first.priority,
            customer_note=first.customer_note,
            ready_at=first.ready_at,
            served_at=first.served_at,
            total_amount=Decimal("0"),
        )
        db.add(new_order)
        db.flush()
        order_total = Decimal("0")
        for si in split_def.items:
            orig = item_map[si.order_item_id]
            line_total = orig.unit_price * si.quantity
            db.add(OrderItem(
                order_id=new_order.id,
                menu_item_id=orig.menu_item_id,
                quantity=si.quantity,
                unit_price=orig.unit_price,
                line_total=line_total,
                note=orig.note,
                status=orig.status,
            ))
            order_total += line_total
        new_order.total_amount = order_total
        new_orders.append(new_order)

    for order in active_orders:
        order.status = OrderStatus.cancelled

    db.commit()

    result: list[Order] = []
    for o in new_orders:
        refreshed = db.scalar(_order_stmt().where(Order.id == o.id))
        if refreshed:
            await _broadcast_order("order.created", refreshed)
            result.append(refreshed)
    return result


@router.patch("/{order_id}/items/{item_id}/status", response_model=OrderRead)
async def update_item_status(
    order_id: int,
    item_id: int,
    payload: OrderItemStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Order:
    item = db.get(OrderItem, item_id)
    if item is None or item.order_id != order_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    item.status = payload.status
    db.flush()

    # Auto-advance order to "ready" when all items are marked ready by kitchen
    if payload.status == "ready":
        order = db.scalar(_order_stmt().where(Order.id == order_id))
        if order and order.status == OrderStatus.in_progress and all(i.status == "ready" for i in order.items):
            order.status = OrderStatus.ready
            now = datetime.now(timezone.utc)
            if order.ready_at is None:
                order.ready_at = now
            db.add(OrderEvent(
                order=order,
                actor_id=current_user.id,
                event_type="order.status_changed",
                from_status=OrderStatus.in_progress,
                to_status=OrderStatus.ready,
                message="All items ready",
            ))

    # Auto-advance order to "served" when all items are marked served by waiter
    if payload.status == "served":
        order = db.scalar(_order_stmt().where(Order.id == order_id))
        if order and order.status not in (OrderStatus.served, OrderStatus.paid, OrderStatus.cancelled) and all(i.status == "served" for i in order.items):
            old_status = order.status
            order.status = OrderStatus.served
            now = datetime.now(timezone.utc)
            if order.served_at is None:
                order.served_at = now
            db.add(OrderEvent(
                order=order,
                actor_id=current_user.id,
                event_type="order.status_changed",
                from_status=old_status,
                to_status=OrderStatus.served,
                message="All items served",
            ))

    db.commit()
    order = db.scalar(_order_stmt().where(Order.id == order_id))
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    await _broadcast_order("order.updated", order)
    return order


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_order(
    order_id: int,
    write_off: bool = Query(default=True, description="True=cancel (keep record); False=hard delete"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if current_user.role != UserRole.manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager only")

    order = db.scalar(_order_stmt().where(Order.id == order_id))
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if write_off:
        # Soft cancel — change status to cancelled, keep all records
        if order.status in FINAL_STATUSES:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Order is already finalized")
        prev_status = order.status
        order.status = OrderStatus.cancelled
        others_active = db.scalar(
            select(func.count(Order.id)).where(
                Order.table_id == order.table_id,
                Order.id != order.id,
                Order.status.not_in([OrderStatus.paid, OrderStatus.cancelled]),
            )
        )
        if not others_active:
            order.table.status = TableStatus.free
        db.add(OrderEvent(
            order=order,
            actor_id=current_user.id,
            event_type="order.status_changed",
            from_status=prev_status,
            to_status=OrderStatus.cancelled,
            message="Списан менеджером",
        ))
        db.commit()
        order = db.scalar(_order_stmt().where(Order.id == order.id))
        await _broadcast_order("order.status_changed", order)
    else:
        # Hard delete — remove from database entirely
        if order.payment is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete a paid order. Issue a refund first.",
            )
        others_active = db.scalar(
            select(func.count(Order.id)).where(
                Order.table_id == order.table_id,
                Order.id != order.id,
                Order.status.not_in([OrderStatus.paid, OrderStatus.cancelled]),
            )
        )
        if not others_active:
            order.table.status = TableStatus.free
        broadcast_payload = {
            "type": "order.cancelled",
            "order_id": order.id,
            "status": "cancelled",
            "table_id": order.table_id,
            "waiter_id": order.waiter_id,
            "priority": order.priority.value,
            "total_amount": str(order.total_amount),
        }
        # Delete discounts (no cascade configured on OrderDiscount)
        db.execute(
            select(OrderDiscount).where(OrderDiscount.order_id == order.id)
        )
        for d in db.scalars(select(OrderDiscount).where(OrderDiscount.order_id == order.id)):
            db.delete(d)
        db.delete(order)
        db.commit()
        await websocket_manager.publish(
            ["manager", "kitchen", f"waiter:{broadcast_payload['waiter_id']}"],
            broadcast_payload,
        )
