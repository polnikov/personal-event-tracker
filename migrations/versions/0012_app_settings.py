"""app_settings

Revision ID: 0012_app_settings
Revises: 0011_event_is_cash
"""
from alembic import op
import sqlalchemy as sa


revision = "0012_app_settings"
down_revision = "0011_event_is_cash"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No seed row: the API creates it on first read, which also covers
    # databases whose row was deleted by hand.
    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("default_tax", sa.Numeric(5, 2), nullable=False, server_default="6"),
        sa.Column("default_royalty", sa.Numeric(5, 2), nullable=False, server_default="10"),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
