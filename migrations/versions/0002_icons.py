"""add icon column to categories and subcategories

Revision ID: 0002_icons
Revises: 0001_initial
"""
from alembic import op
import sqlalchemy as sa


revision = "0002_icons"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("categories") as batch:
        batch.add_column(sa.Column("icon", sa.String(length=64), nullable=True))
    with op.batch_alter_table("subcategories") as batch:
        batch.add_column(sa.Column("icon", sa.String(length=64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("subcategories") as batch:
        batch.drop_column("icon")
    with op.batch_alter_table("categories") as batch:
        batch.drop_column("icon")
