"""add tax and royalty percentages to events

Revision ID: 0003_event_tax_royalty
Revises: 0002_icons
"""
from alembic import op
import sqlalchemy as sa


revision = "0003_event_tax_royalty"
down_revision = "0002_icons"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("events") as batch:
        batch.add_column(
            sa.Column("tax", sa.Numeric(5, 2), nullable=False, server_default="0")
        )
        batch.add_column(
            sa.Column("royalty", sa.Numeric(5, 2), nullable=False, server_default="0")
        )


def downgrade() -> None:
    with op.batch_alter_table("events") as batch:
        batch.drop_column("royalty")
        batch.drop_column("tax")
