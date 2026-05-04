"""production schema

Revision ID: 0001_production_schema
Revises:
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_production_schema"
down_revision = None
branch_labels = None
depends_on = None


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _has_column(inspector, table: str, column: str) -> bool:
    return _has_table(inspector, table) and column in {col["name"] for col in inspector.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    user_role = sa.Enum("manager", "waiter", "kitchen", name="userrole")
    table_status = sa.Enum("free", "occupied", "reserved", "cleaning", name="tablestatus")
    order_status = sa.Enum("pending", "in_progress", "ready", "served", "paid", "cancelled", name="orderstatus")
    order_priority = sa.Enum("low", "normal", "high", "urgent", name="orderpriority")
    peripheral_type = sa.Enum("receipt_printer", "cash_drawer", "barcode_scanner", name="peripheraltype")
    print_job_status = sa.Enum("queued", "processing", "completed", "failed", name="printjobstatus")

    if not _has_table(inspector, "users"):
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("username", sa.String(80), nullable=False, unique=True, index=True),
            sa.Column("full_name", sa.String(160), nullable=False),
            sa.Column("hashed_password", sa.String(255), nullable=False),
            sa.Column("role", user_role, nullable=False, index=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _has_table(inspector, "auth_sessions"):
        op.create_table(
            "auth_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("refresh_token_hash", sa.String(64), nullable=False, unique=True, index=True),
            sa.Column("user_agent", sa.String(255)),
            sa.Column("ip_address", sa.String(80)),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False, index=True),
            sa.Column("revoked_at", sa.DateTime(timezone=True), index=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if not _has_table(inspector, "auth_audit_events"):
        op.create_table(
            "auth_audit_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), index=True),
            sa.Column("username", sa.String(80), index=True),
            sa.Column("event_type", sa.String(80), nullable=False, index=True),
            sa.Column("ip_address", sa.String(80)),
            sa.Column("user_agent", sa.String(255)),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        )
    if not _has_table(inspector, "tables"):
        op.create_table(
            "tables",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("number", sa.String(20), nullable=False, unique=True, index=True),
            sa.Column("seats", sa.Integer(), nullable=False),
            sa.Column("status", table_status, nullable=False),
            sa.Column("location", sa.String(120)),
        )
    if not _has_table(inspector, "menu_categories"):
        op.create_table(
            "menu_categories",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(120), nullable=False, unique=True),
            sa.Column("sort_order", sa.Integer(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
        )
    if not _has_table(inspector, "menu_items"):
        op.create_table(
            "menu_items",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("category_id", sa.Integer(), sa.ForeignKey("menu_categories.id"), nullable=False),
            sa.Column("name", sa.String(160), nullable=False, index=True),
            sa.Column("barcode", sa.String(80), unique=True, index=True),
            sa.Column("description", sa.Text()),
            sa.Column("price", sa.Numeric(10, 2), nullable=False),
            sa.Column("preparation_time_minutes", sa.Integer(), nullable=False),
            sa.Column("is_available", sa.Boolean(), nullable=False),
        )
    elif not _has_column(inspector, "menu_items", "barcode"):
        op.add_column("menu_items", sa.Column("barcode", sa.String(80), nullable=True))

    if not _has_table(inspector, "orders"):
        op.create_table(
            "orders",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("table_id", sa.Integer(), sa.ForeignKey("tables.id"), nullable=False, index=True),
            sa.Column("waiter_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("client_request_id", sa.String(120), index=True),
            sa.Column("source_device_id", sa.String(120), index=True),
            sa.Column("status", order_status, nullable=False, index=True),
            sa.Column("priority", order_priority, nullable=False),
            sa.Column("customer_note", sa.Text()),
            sa.Column("total_amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("ready_at", sa.DateTime(timezone=True)),
            sa.Column("served_at", sa.DateTime(timezone=True)),
            sa.Column("paid_at", sa.DateTime(timezone=True)),
            sa.UniqueConstraint("waiter_id", "client_request_id", name="uq_orders_waiter_client_request"),
        )
    else:
        if not _has_column(inspector, "orders", "client_request_id"):
            op.add_column("orders", sa.Column("client_request_id", sa.String(120), nullable=True))
        if not _has_column(inspector, "orders", "source_device_id"):
            op.add_column("orders", sa.Column("source_device_id", sa.String(120), nullable=True))
        if not _has_column(inspector, "orders", "served_at"):
            op.add_column("orders", sa.Column("served_at", sa.DateTime(timezone=True), nullable=True))

    if not _has_table(inspector, "order_items"):
        op.create_table(
            "order_items",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False, index=True),
            sa.Column("menu_item_id", sa.Integer(), sa.ForeignKey("menu_items.id"), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
            sa.Column("line_total", sa.Numeric(10, 2), nullable=False),
            sa.Column("note", sa.Text()),
        )
    if not _has_table(inspector, "order_events"):
        op.create_table(
            "order_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False, index=True),
            sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id")),
            sa.Column("event_type", sa.String(80), nullable=False, index=True),
            sa.Column("from_status", order_status),
            sa.Column("to_status", order_status),
            sa.Column("message", sa.Text()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        )
    if not _has_table(inspector, "peripheral_devices"):
        op.create_table(
            "peripheral_devices",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(120), nullable=False, unique=True),
            sa.Column("device_type", peripheral_type, nullable=False, index=True),
            sa.Column("identifier", sa.String(160), nullable=False, unique=True, index=True),
            sa.Column("location", sa.String(120)),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if not _has_table(inspector, "print_jobs"):
        op.create_table(
            "print_jobs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("device_id", sa.Integer(), sa.ForeignKey("peripheral_devices.id"), nullable=False, index=True),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), index=True),
            sa.Column("job_type", sa.String(80), nullable=False, index=True),
            sa.Column("status", print_job_status, nullable=False, index=True),
            sa.Column("payload", sa.JSON(), nullable=False),
            sa.Column("error_message", sa.Text()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
            sa.Column("processed_at", sa.DateTime(timezone=True)),
        )


def downgrade() -> None:
    op.drop_table("print_jobs")
    op.drop_table("peripheral_devices")
    op.drop_table("order_events")
    op.drop_table("order_items")
    op.drop_table("orders")
    op.drop_table("menu_items")
    op.drop_table("menu_categories")
    op.drop_table("tables")
    op.drop_table("auth_audit_events")
    op.drop_table("auth_sessions")
    op.drop_table("users")
