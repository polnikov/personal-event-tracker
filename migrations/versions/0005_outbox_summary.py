"""snapshot human-readable summary on outbox rows

Revision ID: 0005_outbox_summary
Revises: 0004_google_sync
"""
from alembic import op
import sqlalchemy as sa


revision = "0005_outbox_summary"
down_revision = "0004_google_sync"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("google_sync_outbox") as batch:
        batch.add_column(sa.Column("summary", sa.String(length=500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("google_sync_outbox") as batch:
        batch.drop_column("summary")
