from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import require_roles
from app.models import (
    Order,
    OrderDiscount,
    OrderEvent,
    OrderStatus,
    Payment,
    PaymentMethod,
    Refund,
    ShiftStatus,
    StaffShift,
    TableStatus,
    User,
    UserRole,
)
from app.schemas import (
    DiscountCreate,
    DiscountRead,
    PaymentCreate,
    PaymentRead,
    RefundCreate,
    RefundRead,
    ShiftClose,
    ShiftOpen,
    ShiftRead,
    ShiftReport,
)

router = APIRouter(prefix="/pos", tags=["pos"])


def _open_shift(db: Session) -> StaffShift | None:
    return db.scalar(select(StaffShift).where(StaffShift.status == ShiftStatus.open).order_by(StaffShift.id.desc()))


def _discount_total(order: Order, db: Session) -> Decimal:
    discounts = list(db.scalars(select(OrderDiscount).where(OrderDiscount.order_id == order.id)))
    total = Decimal("0.00")
    for discount in discounts:
        if discount.discount_type.value == "percent":
            total += (Decimal(order.total_amount) * Decimal(discount.value) / Decimal("100")).quantize(Decimal("0.01"))
        else:
            total += Decimal(discount.value)
    return min(total, Decimal(order.total_amount))


@router.post("/shifts/open", response_model=ShiftRead, status_code=status.HTTP_201_CREATED)
def open_shift(
    payload: ShiftOpen,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.manager)),
) -> StaffShift:
    if _open_shift(db) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A shift is already open")
    shift = StaffShift(
        opened_by_id=current_user.id,
        opening_cash_amount=payload.opening_cash_amount,
        note=payload.note,
        status=ShiftStatus.open,
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift


@router.get("/shifts/current", response_model=ShiftRead)
def current_shift(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager, UserRole.waiter)),
) -> StaffShift:
    shift = _open_shift(db)
    if shift is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No open shift")
    return shift


@router.post("/shifts/{shift_id}/close", response_model=ShiftRead)
def close_shift(
    shift_id: int,
    payload: ShiftClose,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.manager)),
) -> StaffShift:
    shift = db.get(StaffShift, shift_id)
    if shift is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")
    if shift.status != ShiftStatus.open:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Shift is already closed")
    shift.status = ShiftStatus.closed
    shift.closed_by_id = current_user.id
    shift.closing_cash_amount = payload.closing_cash_amount
    shift.closed_at = datetime.now(timezone.utc)
    shift.note = payload.note or shift.note
    db.commit()
    db.refresh(shift)
    return shift


@router.post("/orders/{order_id}/discounts", response_model=DiscountRead, status_code=status.HTTP_201_CREATED)
def create_discount(
    order_id: int,
    payload: DiscountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.manager)),
) -> OrderDiscount:
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if order.status in {OrderStatus.paid, OrderStatus.cancelled}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot discount final order")
    discount = OrderDiscount(order_id=order.id, created_by_id=current_user.id, **payload.model_dump())
    db.add(discount)
    db.add(OrderEvent(order=order, actor_id=current_user.id, event_type="order.discount_added", message=payload.reason))
    db.commit()
    db.refresh(discount)
    return discount


@router.post("/orders/{order_id}/payments", response_model=PaymentRead, status_code=status.HTTP_201_CREATED)
def create_payment(
    order_id: int,
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.manager, UserRole.waiter)),
) -> Payment:
    shift = _open_shift(db)
    if shift is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No open shift")
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if current_user.role == UserRole.waiter and order.waiter_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot pay another waiter's order")
    if order.status not in {OrderStatus.served, OrderStatus.ready}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Order must be ready or served before payment")
    if db.scalar(select(Payment).where(Payment.order_id == order.id)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Order is already paid")

    discount_amount = _discount_total(order, db)
    subtotal = Decimal(order.total_amount)
    final_amount = max(Decimal("0.00"), subtotal - discount_amount + payload.tax_amount + payload.service_fee_amount)
    if payload.amount_received < final_amount:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Payment amount does not cover final total")

    payment = Payment(
        order_id=order.id,
        shift_id=shift.id,
        created_by_id=current_user.id,
        method=payload.method,
        external_reference=payload.external_reference,
        subtotal_amount=subtotal,
        discount_amount=discount_amount,
        tax_amount=payload.tax_amount,
        service_fee_amount=payload.service_fee_amount,
        final_amount=final_amount,
        amount_received=payload.amount_received,
        change_due=payload.amount_received - final_amount,
    )
    order.status = OrderStatus.paid
    order.paid_at = datetime.now(timezone.utc)
    order.table.status = TableStatus.free
    db.add(payment)
    db.add(
        OrderEvent(
            order=order,
            actor_id=current_user.id,
            event_type="order.paid",
            from_status=OrderStatus.served,
            to_status=OrderStatus.paid,
            message=f"Paid by {payload.method.value}",
        )
    )
    db.commit()
    db.refresh(payment)
    return payment


@router.post("/payments/{payment_id}/refunds", response_model=RefundRead, status_code=status.HTTP_201_CREATED)
def create_refund(
    payment_id: int,
    payload: RefundCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.manager)),
) -> Refund:
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    refunded = db.scalar(select(func.coalesce(func.sum(Refund.amount), 0)).where(Refund.payment_id == payment.id))
    if Decimal(refunded or 0) + payload.amount > payment.final_amount:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Refund exceeds payment total")
    refund = Refund(payment_id=payment.id, created_by_id=current_user.id, amount=payload.amount, reason=payload.reason)
    db.add(refund)
    db.add(
        OrderEvent(
            order_id=payment.order_id,
            actor_id=current_user.id,
            event_type="payment.refunded",
            message=payload.reason,
        )
    )
    db.commit()
    db.refresh(refund)
    return refund


@router.get("/shifts/{shift_id}/report", response_model=ShiftReport)
def shift_report(
    shift_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.manager)),
) -> ShiftReport:
    shift = db.get(StaffShift, shift_id)
    if shift is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")
    payments_total = Decimal(db.scalar(select(func.coalesce(func.sum(Payment.final_amount), 0)).where(Payment.shift_id == shift.id)) or 0)
    refunds_total = Decimal(
        db.scalar(
            select(func.coalesce(func.sum(Refund.amount), 0))
            .join(Payment, Payment.id == Refund.payment_id)
            .where(Payment.shift_id == shift.id)
        )
        or 0
    )
    rows = db.execute(
        select(Payment.method, func.count(Payment.id).label("count"), func.coalesce(func.sum(Payment.final_amount), 0).label("total"))
        .where(Payment.shift_id == shift.id)
        .group_by(Payment.method)
    ).all()
    return ShiftReport(
        shift_id=shift.id,
        status=shift.status,
        payments_total=payments_total,
        refunds_total=refunds_total,
        net_total=payments_total - refunds_total,
        orders_paid=int(db.scalar(select(func.count(Payment.id)).where(Payment.shift_id == shift.id)) or 0),
        payments_by_method=[{"method": row.method.value, "count": int(row.count), "total": str(row.total)} for row in rows],
    )
