"""pos and device agent schema

Revision ID: 0002_pos_and_agent_schema
Revises: 0001_production_schema
Create Date: 2026-05-04
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_pos_and_agent_schema"
down_revision = "0001_production_schema"
branch_labels = None
depends_on = None


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    shift_status = sa.Enum("open", "closed", name="shiftstatus")
    discount_type = sa.Enum("amount", "percent", name="discounttype")
    payment_method = sa.Enum("cash", "card", "mixed", "external", name="paymentmethod")
    refund_status = sa.Enum("completed", name="refundstatus")

    if not _has_table(inspector, "staff_shifts"):
        op.create_table(
            "staff_shifts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("opened_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("closed_by_id", sa.Integer(), sa.ForeignKey("users.id"), index=True),
            sa.Column("status", shift_status, nullable=False, index=True),
            sa.Column("opening_cash_amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("closing_cash_amount", sa.Numeric(10, 2)),
            sa.Column("opened_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
            sa.Column("closed_at", sa.DateTime(timezone=True), index=True),
            sa.Column("note", sa.Text()),
        )

    if not _has_table(inspector, "order_discounts"):
        op.create_table(
            "order_discounts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False, index=True),
            sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("discount_type", discount_type, nullable=False),
            sa.Column("value", sa.Numeric(10, 2), nullable=False),
            sa.Column("reason", sa.String(255), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
            sa.CheckConstraint("value > 0", name="ck_order_discounts_value_positive"),
        )

    if not _has_table(inspector, "payments"):
        op.create_table(
            "payments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False, unique=True, index=True),
            sa.Column("shift_id", sa.Integer(), sa.ForeignKey("staff_shifts.id"), nullable=False, index=True),
            sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("method", payment_method, nullable=False, index=True),
            sa.Column("external_reference", sa.String(160), index=True),
            sa.Column("subtotal_amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("discount_amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("tax_amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("service_fee_amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("final_amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("amount_received", sa.Numeric(10, 2), nullable=False),
            sa.Column("change_due", sa.Numeric(10, 2), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
            sa.CheckConstraint("subtotal_amount >= 0", name="ck_payments_subtotal_non_negative"),
            sa.CheckConstraint("discount_amount >= 0", name="ck_payments_discount_non_negative"),
            sa.CheckConstraint("tax_amount >= 0", name="ck_payments_tax_non_negative"),
            sa.CheckConstraint("service_fee_amount >= 0", name="ck_payments_service_fee_non_negative"),
            sa.CheckConstraint("final_amount >= 0", name="ck_payments_final_non_negative"),
            sa.CheckConstraint("amount_received >= final_amount", name="ck_payments_amount_received_covers_final"),
        )

    if not _has_table(inspector, "refunds"):
        op.create_table(
            "refunds",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("payment_id", sa.Integer(), sa.ForeignKey("payments.id"), nullable=False, index=True),
            sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("reason", sa.String(255), nullable=False),
            sa.Column("status", refund_status, nullable=False, index=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
            sa.CheckConstraint("amount > 0", name="ck_refunds_amount_positive"),
        )

    if not _has_table(inspector, "device_agent_tokens"):
        op.create_table(
            "device_agent_tokens",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("device_id", sa.Integer(), sa.ForeignKey("peripheral_devices.id"), nullable=False, index=True),
            sa.Column("token_hash", sa.String(64), nullable=False, unique=True, index=True),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, index=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("revoked_at", sa.DateTime(timezone=True), index=True),
        )

    if not _has_table(inspector, "print_job_leases"):
        op.create_table(
            "print_job_leases",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("job_id", sa.Integer(), sa.ForeignKey("print_jobs.id"), nullable=False, unique=True, index=True),
            sa.Column("device_id", sa.Integer(), sa.ForeignKey("peripheral_devices.id"), nullable=False, index=True),
            sa.Column("lease_token_hash", sa.String(64), nullable=False, unique=True, index=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False, index=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("heartbeat_at", sa.DateTime(timezone=True)),
        )


def downgrade() -> None:
    op.drop_table("print_job_leases")
    op.drop_table("device_agent_tokens")
    op.drop_table("refunds")
    op.drop_table("payments")
    op.drop_table("order_discounts")
    op.drop_table("staff_shifts")
