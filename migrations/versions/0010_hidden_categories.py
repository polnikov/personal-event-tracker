"""categories.hidden + subcategories.hidden

Revision ID: 0010_hidden_categories
Revises: 0009_subscription_notes
"""
from alembic import op
import sqlalchemy as sa


revision = "0010_hidden_categories"
down_revision = "0009_subscription_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default backfills the existing rows; the ORM keeps writing the
    # value explicitly, so the default is only needed for this ALTER.
    for table in ("categories", "subcategories"):
        op.add_column(
            table,
            sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        )


def downgrade() -> None:
    for table in ("subcategories", "categories"):
        with op.batch_alter_table(table) as batch:
            batch.drop_column("hidden")
