"""subscriptions.notes

Revision ID: 0009_subscription_notes
Revises: 0008_subscriptions
"""
from alembic import op
import sqlalchemy as sa


revision = "0009_subscription_notes"
down_revision = "0008_subscriptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subscriptions", sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("subscriptions") as batch:
        batch.drop_column("notes")
