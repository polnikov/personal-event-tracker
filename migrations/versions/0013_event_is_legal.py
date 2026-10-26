"""events.is_legal

Revision ID: 0013_event_is_legal
Revises: 0012_app_settings
"""
from alembic import op
import sqlalchemy as sa


revision = "0013_event_is_legal"
down_revision = "0012_app_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Same shape as is_cash (0011): server_default only backfills existing rows.
    op.add_column(
        "events",
        sa.Column("is_legal", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    with op.batch_alter_table("events") as batch:
        batch.drop_column("is_legal")
