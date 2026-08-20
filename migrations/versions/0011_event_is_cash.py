"""events.is_cash

Revision ID: 0011_event_is_cash
Revises: 0010_hidden_categories
"""
from alembic import op
import sqlalchemy as sa


revision = "0011_event_is_cash"
down_revision = "0010_hidden_categories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default backfills the existing rows; the ORM keeps writing the
    # value explicitly, so the default is only needed for this ALTER.
    op.add_column(
        "events",
        sa.Column("is_cash", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    with op.batch_alter_table("events") as batch:
        batch.drop_column("is_cash")
