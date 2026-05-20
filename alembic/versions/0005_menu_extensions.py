"""menu extensions: modifiers JSON field + price history table

Revision ID: 0005_menu_extensions
Revises: 0004_is_takeaway_table
Create Date: 2026-05-20

"""
from alembic import op
import sqlalchemy as sa

revision = "0005_menu_extensions"
down_revision = "0004_is_takeaway_table"
branch_labels = None
depends_on = None


def _has_column(inspector, table: str, column: str) -> bool:
    return any(c["name"] == column for c in inspector.get_columns(table))


def _has_table(inspector, table: str) -> bool:
    return table in inspector.get_table_names()


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    # 1. Add modifiers JSON column to menu_items
    if not _has_column(inspector, "menu_items", "modifiers"):
        op.add_column(
            "menu_items",
            sa.Column("modifiers", sa.JSON(), nullable=True),
        )

    # 2. Create menu_item_price_history table
    if not _has_table(inspector, "menu_item_price_history"):
        op.create_table(
            "menu_item_price_history",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("menu_item_id", sa.Integer(), sa.ForeignKey("menu_items.id"), nullable=False, index=True),
            sa.Column("old_price", sa.Numeric(10, 2), nullable=False),
            sa.Column("new_price", sa.Numeric(10, 2), nullable=False),
            sa.Column("changed_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column(
                "changed_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )


def downgrade() -> None:
    op.drop_table("menu_item_price_history")
    op.drop_column("menu_items", "modifiers")
