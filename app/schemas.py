from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models import OrderPriority, OrderStatus, PeripheralType, PrintJobStatus, TableStatus, UserRole


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)


class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    full_name: str = Field(min_length=2, max_length=160)
    role: UserRole
    is_active: bool = True


class UserCreate(UserBase):
    password: str = Field(min_length=6, max_length=128)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    role: UserRole | None = None
    is_active: bool | None = None


class UserRead(UserBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TableBase(BaseModel):
    number: str = Field(min_length=1, max_length=20)
    seats: int = Field(ge=1, le=30)
    status: TableStatus = TableStatus.free
    location: str | None = Field(default=None, max_length=120)


class TableCreate(TableBase):
    pass


class TableUpdate(BaseModel):
    number: str | None = Field(default=None, min_length=1, max_length=20)
    seats: int | None = Field(default=None, ge=1, le=30)
    status: TableStatus | None = None
    location: str | None = Field(default=None, max_length=120)


class TableRead(TableBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class TableOverview(TableRead):
    active_order_id: int | None = None
    active_order_status: OrderStatus | None = None
    active_order_total: Decimal | None = None
    active_waiter_name: str | None = None


class CategoryBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    sort_order: int = 0
    is_active: bool = True


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    sort_order: int | None = None
    is_active: bool | None = None


class CategoryRead(CategoryBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class MenuItemBase(BaseModel):
    category_id: int
    name: str = Field(min_length=2, max_length=160)
    barcode: str | None = Field(default=None, max_length=80)
    description: str | None = None
    price: Decimal = Field(gt=0, decimal_places=2)
    preparation_time_minutes: int = Field(default=10, ge=1, le=240)
    is_available: bool = True


class MenuItemCreate(MenuItemBase):
    pass


class MenuItemUpdate(BaseModel):
    category_id: int | None = None
    name: str | None = Field(default=None, min_length=2, max_length=160)
    barcode: str | None = Field(default=None, max_length=80)
    description: str | None = None
    price: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    preparation_time_minutes: int | None = Field(default=None, ge=1, le=240)
    is_available: bool | None = None


class MenuItemRead(MenuItemBase):
    id: int
    category: CategoryRead | None = None

    model_config = ConfigDict(from_attributes=True)


class OrderItemCreate(BaseModel):
    menu_item_id: int
    quantity: int = Field(ge=1, le=99)
    note: str | None = None


class OrderCreate(BaseModel):
    table_id: int
    client_request_id: str | None = Field(default=None, min_length=8, max_length=120)
    source_device_id: str | None = Field(default=None, max_length=120)
    priority: OrderPriority = OrderPriority.normal
    customer_note: str | None = None
    items: list[OrderItemCreate] = Field(min_length=1)


class OrderUpdate(BaseModel):
    table_id: int | None = None
    priority: OrderPriority | None = None
    customer_note: str | None = None
    items: list[OrderItemCreate] | None = Field(default=None, min_length=1)


class OrderSyncRequest(BaseModel):
    orders: list[OrderCreate] = Field(min_length=1, max_length=100)


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    message: str | None = None


class OrderItemRead(BaseModel):
    id: int
    menu_item_id: int
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    note: str | None = None
    menu_item: MenuItemRead | None = None

    model_config = ConfigDict(from_attributes=True)


class OrderEventRead(BaseModel):
    id: int
    actor_id: int | None = None
    event_type: str
    from_status: OrderStatus | None = None
    to_status: OrderStatus | None = None
    message: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OrderRead(BaseModel):
    id: int
    table_id: int
    waiter_id: int
    client_request_id: str | None = None
    source_device_id: str | None = None
    status: OrderStatus
    priority: OrderPriority
    customer_note: str | None = None
    total_amount: Decimal
    created_at: datetime
    updated_at: datetime
    ready_at: datetime | None = None
    served_at: datetime | None = None
    paid_at: datetime | None = None
    table: TableRead | None = None
    waiter: UserRead | None = None
    items: list[OrderItemRead] = []
    events: list[OrderEventRead] = []

    model_config = ConfigDict(from_attributes=True)


class OrderSyncResult(BaseModel):
    client_request_id: str | None
    status: str
    order: OrderRead | None = None
    error: str | None = None


class AnalyticsSummary(BaseModel):
    active_orders: int
    completed_orders: int
    paid_orders: int
    revenue: Decimal
    average_preparation_seconds: float | None
    average_customer_wait_seconds: float | None
    popular_items: list[dict]
    peak_hours: list[dict]
    staff_productivity: list[dict]


class DashboardMetric(BaseModel):
    key: str
    label: str
    value: int | str | float


class KitchenBoardResponse(BaseModel):
    pending: list[OrderRead]
    in_progress: list[OrderRead]
    ready: list[OrderRead]
    metrics: list[DashboardMetric]


class WaiterDashboardResponse(BaseModel):
    active_orders: list[OrderRead]
    ready_orders: list[OrderRead]
    occupied_tables: list[TableOverview]
    metrics: list[DashboardMetric]


class PeripheralDeviceBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    device_type: PeripheralType
    identifier: str = Field(min_length=2, max_length=160)
    location: str | None = Field(default=None, max_length=120)
    is_active: bool = True


class PeripheralDeviceCreate(PeripheralDeviceBase):
    pass


class PeripheralDeviceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    device_type: PeripheralType | None = None
    identifier: str | None = Field(default=None, min_length=2, max_length=160)
    location: str | None = Field(default=None, max_length=120)
    is_active: bool | None = None


class PeripheralDeviceRead(PeripheralDeviceBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PrintJobCreate(BaseModel):
    device_id: int
    order_id: int | None = None
    job_type: str = Field(min_length=2, max_length=80)
    payload: dict = Field(default_factory=dict)


class PrintJobUpdate(BaseModel):
    status: PrintJobStatus
    error_message: str | None = None


class PrintJobRead(BaseModel):
    id: int
    device_id: int
    order_id: int | None = None
    job_type: str
    status: PrintJobStatus
    payload: dict
    error_message: str | None = None
    created_at: datetime
    processed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
