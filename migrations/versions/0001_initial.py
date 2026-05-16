"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-05
"""
from alembic import op
import sqlalchemy as sa


revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("color", sa.String(7), nullable=False, server_default="#3b82f6"),
        sa.Column("google_calendar_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "subcategories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("categories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_subcat_category", "subcategories", ["category_id"])

    op.create_table(
        "subcategory_prices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "subcategory_id",
            sa.Integer(),
            sa.ForeignKey("subcategories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("price_per_hour", sa.Numeric(12, 2), nullable=False),
        sa.Column("effective_from", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_price_subcat_date", "subcategory_prices", ["subcategory_id", "effective_from"]
    )

    op.create_table(
        "clients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False, server_default=""),
        sa.Column("phone", sa.String(40), nullable=True),
        sa.Column("telegram", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "subcategory_id", sa.Integer(), sa.ForeignKey("subcategories.id"), nullable=False
        ),
        sa.Column(
            "client_id",
            sa.Integer(),
            sa.ForeignKey("clients.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("start_at", sa.DateTime(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("hourly_rate_snapshot", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_cost", sa.Numeric(12, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("google_event_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_event_start", "events", ["start_at"])
    op.create_index("ix_event_client", "events", ["client_id"])
    op.create_index("ix_event_subcat", "events", ["subcategory_id"])


def downgrade() -> None:
    op.drop_index("ix_event_subcat", table_name="events")
    op.drop_index("ix_event_client", table_name="events")
    op.drop_index("ix_event_start", table_name="events")
    op.drop_table("events")
    op.drop_table("clients")
    op.drop_index("ix_price_subcat_date", table_name="subcategory_prices")
    op.drop_table("subcategory_prices")
    op.drop_index("ix_subcat_category", table_name="subcategories")
    op.drop_table("subcategories")
    op.drop_table("categories")
