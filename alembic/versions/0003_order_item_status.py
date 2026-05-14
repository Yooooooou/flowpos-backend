"""order item status

Revision ID: 0003_order_item_status
Revises: 0002_pos_and_agent_schema
Create Date: 2026-05-14

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import Inspector


def _has_column(inspector: Inspector, table: str, column: str) -> bool:
    return any(c["name"] == column for c in inspector.get_columns(table))


def upgrade() -> None:
    inspector = Inspector.from_engine(op.get_bind())
    if not _has_column(inspector, "order_items", "status"):
        op.add_column(
            "order_items",
            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        )


def downgrade() -> None:
    op.drop_column("order_items", "status")
