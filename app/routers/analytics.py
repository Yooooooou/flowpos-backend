from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import require_roles
from app.models import MenuItem, Order, OrderItem, OrderStatus, User, UserRole
from app.schemas import AnalyticsSummary

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary", response_model=AnalyticsSummary)
def summary(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> AnalyticsSummary:
    active_orders = db.scalar(
        select(func.count(Order.id)).where(
            Order.status.in_([OrderStatus.pending, OrderStatus.in_progress, OrderStatus.ready, OrderStatus.served])
        )
    )
    completed_orders = db.scalar(select(func.count(Order.id)).where(Order.status.in_([OrderStatus.paid, OrderStatus.cancelled])))
    paid_orders = db.scalar(select(func.count(Order.id)).where(Order.status == OrderStatus.paid))
    revenue = db.scalar(select(func.coalesce(func.sum(Order.total_amount), 0)).where(Order.status == OrderStatus.paid))

    ready_orders = list(
        db.scalars(select(Order).where(Order.ready_at.is_not(None), Order.created_at.is_not(None)))
    )
    durations = [
        (order.ready_at - order.created_at).total_seconds()
        for order in ready_orders
        if order.ready_at is not None and order.created_at is not None
    ]
    average_preparation_seconds = sum(durations) / len(durations) if durations else None

    served_orders = list(db.scalars(select(Order).where(Order.served_at.is_not(None), Order.created_at.is_not(None))))
    wait_durations = [
        (order.served_at - order.created_at).total_seconds()
        for order in served_orders
        if order.served_at is not None and order.created_at is not None
    ]
    average_customer_wait_seconds = sum(wait_durations) / len(wait_durations) if wait_durations else None

    rows = db.execute(
        select(MenuItem.id, MenuItem.name, func.sum(OrderItem.quantity).label("quantity"))
        .join(OrderItem, OrderItem.menu_item_id == MenuItem.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.status != OrderStatus.cancelled)
        .group_by(MenuItem.id, MenuItem.name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(5)
    ).all()
    popular_items = [{"id": row.id, "name": row.name, "quantity": int(row.quantity)} for row in rows]

    all_orders = list(db.scalars(select(Order).where(Order.created_at.is_not(None))))
    hour_counts: dict[int, int] = {}
    for order in all_orders:
        hour_counts[order.created_at.hour] = hour_counts.get(order.created_at.hour, 0) + 1
    peak_hours = [
        {"hour": hour, "orders": count}
        for hour, count in sorted(hour_counts.items(), key=lambda item: item[1], reverse=True)[:5]
    ]

    staff_rows = db.execute(
        select(User.id, User.full_name, func.count(Order.id).label("orders"), func.coalesce(func.sum(Order.total_amount), 0).label("revenue"))
        .join(Order, Order.waiter_id == User.id)
        .where(User.role == UserRole.waiter, Order.status != OrderStatus.cancelled)
        .group_by(User.id, User.full_name)
        .order_by(func.count(Order.id).desc())
    ).all()
    staff_productivity = [
        {
            "waiter_id": row.id,
            "full_name": row.full_name,
            "orders": int(row.orders),
            "revenue": str(row.revenue),
        }
        for row in staff_rows
    ]

    return AnalyticsSummary(
        active_orders=active_orders or 0,
        completed_orders=completed_orders or 0,
        paid_orders=paid_orders or 0,
        revenue=Decimal(revenue or 0),
        average_preparation_seconds=average_preparation_seconds,
        average_customer_wait_seconds=average_customer_wait_seconds,
        popular_items=popular_items,
        peak_hours=peak_hours,
        staff_productivity=staff_productivity,
    )
