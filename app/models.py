import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Integer, JSON, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class UserRole(str, enum.Enum):
    manager = "manager"
    waiter = "waiter"
    kitchen = "kitchen"


class TableStatus(str, enum.Enum):
    free = "free"
    occupied = "occupied"
    reserved = "reserved"
    cleaning = "cleaning"


class OrderStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    ready = "ready"
    served = "served"
    paid = "paid"
    cancelled = "cancelled"


class OrderPriority(str, enum.Enum):
    low = "low"
    normal = "normal"
    high = "high"
    urgent = "urgent"


class PeripheralType(str, enum.Enum):
    receipt_printer = "receipt_printer"
    cash_drawer = "cash_drawer"
    barcode_scanner = "barcode_scanner"


class PrintJobStatus(str, enum.Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    card = "card"
    mixed = "mixed"
    external = "external"


class ShiftStatus(str, enum.Enum):
    open = "open"
    closed = "closed"


class RefundStatus(str, enum.Enum):
    completed = "completed"


class DiscountType(str, enum.Enum):
    amount = "amount"
    percent = "percent"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    orders: Mapped[list["Order"]] = relationship(back_populates="waiter")


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(80), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship()


class AuthAuditEvent(Base):
    __tablename__ = "auth_audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    username: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    ip_address: Mapped[str | None] = mapped_column(String(80), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    user: Mapped[User | None] = relationship()


class CafeTable(Base):
    __tablename__ = "tables"
    __table_args__ = (CheckConstraint("seats > 0", name="ck_tables_seats_positive"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    seats: Mapped[int] = mapped_column(Integer, default=2)
    status: Mapped[TableStatus] = mapped_column(Enum(TableStatus), default=TableStatus.free)
    location: Mapped[str | None] = mapped_column(String(120), nullable=True)

    orders: Mapped[list["Order"]] = relationship(back_populates="table")


class MenuCategory(Base):
    __tablename__ = "menu_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    items: Mapped[list["MenuItem"]] = relationship(back_populates="category")


class MenuItem(Base):
    __tablename__ = "menu_items"
    __table_args__ = (
        CheckConstraint("price > 0", name="ck_menu_items_price_positive"),
        CheckConstraint("preparation_time_minutes > 0", name="ck_menu_items_prep_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("menu_categories.id"))
    name: Mapped[str] = mapped_column(String(160), index=True)
    barcode: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    preparation_time_minutes: Mapped[int] = mapped_column(Integer, default=10)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)

    category: Mapped[MenuCategory] = relationship(back_populates="items")
    order_items: Mapped[list["OrderItem"]] = relationship(back_populates="menu_item")


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("waiter_id", "client_request_id", name="uq_orders_waiter_client_request"),
        CheckConstraint("total_amount >= 0", name="ck_orders_total_non_negative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("tables.id"), index=True)
    waiter_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    client_request_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    source_device_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.pending, index=True)
    priority: Mapped[OrderPriority] = mapped_column(Enum(OrderPriority), default=OrderPriority.normal)
    customer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    served_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    table: Mapped[CafeTable] = relationship(back_populates="orders")
    waiter: Mapped[User] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )
    events: Mapped[list["OrderEvent"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),
        CheckConstraint("unit_price > 0", name="ck_order_items_unit_price_positive"),
        CheckConstraint("line_total > 0", name="ck_order_items_line_total_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    menu_item_id: Mapped[int] = mapped_column(ForeignKey("menu_items.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    line_total: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped[Order] = relationship(back_populates="items")
    menu_item: Mapped[MenuItem] = relationship(back_populates="order_items")


class OrderEvent(Base):
    __tablename__ = "order_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    from_status: Mapped[OrderStatus | None] = mapped_column(Enum(OrderStatus), nullable=True)
    to_status: Mapped[OrderStatus | None] = mapped_column(Enum(OrderStatus), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    order: Mapped[Order] = relationship(back_populates="events")
    actor: Mapped[User | None] = relationship()


class StaffShift(Base):
    __tablename__ = "staff_shifts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    opened_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    closed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    status: Mapped[ShiftStatus] = mapped_column(Enum(ShiftStatus), default=ShiftStatus.open, index=True)
    opening_cash_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    closing_cash_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    opened_by: Mapped[User] = relationship(foreign_keys=[opened_by_id])
    closed_by: Mapped[User | None] = relationship(foreign_keys=[closed_by_id])


class OrderDiscount(Base):
    __tablename__ = "order_discounts"
    __table_args__ = (
        CheckConstraint("value > 0", name="ck_order_discounts_value_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    discount_type: Mapped[DiscountType] = mapped_column(Enum(DiscountType), default=DiscountType.amount)
    value: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    reason: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    order: Mapped[Order] = relationship()
    created_by: Mapped[User] = relationship()


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("subtotal_amount >= 0", name="ck_payments_subtotal_non_negative"),
        CheckConstraint("discount_amount >= 0", name="ck_payments_discount_non_negative"),
        CheckConstraint("tax_amount >= 0", name="ck_payments_tax_non_negative"),
        CheckConstraint("service_fee_amount >= 0", name="ck_payments_service_fee_non_negative"),
        CheckConstraint("final_amount >= 0", name="ck_payments_final_non_negative"),
        CheckConstraint("amount_received >= final_amount", name="ck_payments_amount_received_covers_final"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), unique=True, index=True)
    shift_id: Mapped[int] = mapped_column(ForeignKey("staff_shifts.id"), index=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    method: Mapped[PaymentMethod] = mapped_column(Enum(PaymentMethod), index=True)
    external_reference: Mapped[str | None] = mapped_column(String(160), nullable=True, index=True)
    subtotal_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    service_fee_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    final_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    amount_received: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    change_due: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    order: Mapped[Order] = relationship()
    shift: Mapped[StaffShift] = relationship()
    created_by: Mapped[User] = relationship()


class Refund(Base):
    __tablename__ = "refunds"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_refunds_amount_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id"), index=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    reason: Mapped[str] = mapped_column(String(255))
    status: Mapped[RefundStatus] = mapped_column(Enum(RefundStatus), default=RefundStatus.completed, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    payment: Mapped[Payment] = relationship()
    created_by: Mapped[User] = relationship()


class PeripheralDevice(Base):
    __tablename__ = "peripheral_devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    device_type: Mapped[PeripheralType] = mapped_column(Enum(PeripheralType), index=True)
    identifier: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    location: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    print_jobs: Mapped[list["PrintJob"]] = relationship(back_populates="device")


class DeviceAgentToken(Base):
    __tablename__ = "device_agent_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("peripheral_devices.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    device: Mapped[PeripheralDevice] = relationship()


class PrintJob(Base):
    __tablename__ = "print_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("peripheral_devices.id"), index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"), nullable=True, index=True)
    job_type: Mapped[str] = mapped_column(String(80), index=True)
    status: Mapped[PrintJobStatus] = mapped_column(Enum(PrintJobStatus), default=PrintJobStatus.queued, index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    device: Mapped[PeripheralDevice] = relationship(back_populates="print_jobs")
    order: Mapped[Order | None] = relationship()


class PrintJobLease(Base):
    __tablename__ = "print_job_leases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("print_jobs.id"), unique=True, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("peripheral_devices.id"), index=True)
    lease_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    job: Mapped[PrintJob] = relationship()
    device: Mapped[PeripheralDevice] = relationship()
