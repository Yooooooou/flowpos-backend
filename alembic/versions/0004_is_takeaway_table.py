"""add is_takeaway to tables and insert Вынос table

Revision ID: 0004_is_takeaway_table
Revises: 0003_order_item_status
Create Date: 2026-05-15

"""
from alembic import op
import sqlalchemy as sa

revision = "0004_is_takeaway_table"
down_revision = "0003_order_item_status"
branch_labels = None
depends_on = None


def _has_column(inspector, table: str, column: str) -> bool:
    return any(c["name"] == column for c in inspector.get_columns(table))


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    # 1. Add is_takeaway column if missing
    if not _has_column(inspector, "tables", "is_takeaway"):
        op.add_column(
            "tables",
            sa.Column(
                "is_takeaway",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("FALSE"),
            ),
        )

    # 2. Relax seats constraint to allow 0 (takeaway table has no seats)
    try:
        op.drop_constraint("ck_tables_seats_positive", "tables")
        op.create_check_constraint("ck_tables_seats_nonneg", "tables", "seats >= 0")
    except Exception:
        pass  # constraint may already be updated or named differently

    # 3. Insert the takeaway table if it doesn't exist yet
    op.execute(
        sa.text(
            """
            INSERT INTO tables (number, seats, status, location, is_takeaway)
            SELECT 'Вынос', 0, 'free', 'Вынос', TRUE
            WHERE NOT EXISTS (SELECT 1 FROM tables WHERE number = 'Вынос')
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM tables WHERE number = 'Вынос'"))
    op.drop_column("tables", "is_takeaway")
