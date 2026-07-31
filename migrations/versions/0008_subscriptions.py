"""subscriptions + event.subscription_id

Revision ID: 0008_subscriptions
Revises: 0007_clubs
"""
from alembic import op
import sqlalchemy as sa


revision = "0008_subscriptions"
down_revision = "0007_clubs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("subcategory_id", sa.Integer(), nullable=False),
        sa.Column("lessons_total", sa.Numeric(6, 2), nullable=False),
        sa.Column("price_per_lesson", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_subscription_client", "subscriptions", ["client_id"])
    op.create_index("ix_subscription_subcat", "subscriptions", ["subcategory_id"])
    # Plain nullable column — SQLite doesn't enforce FKs added via ALTER, and
    # the ORM-level ForeignKey on the model is enough for joins/relationships.
    op.add_column("events", sa.Column("subscription_id", sa.Integer(), nullable=True))
    op.create_index("ix_event_subscription", "events", ["subscription_id"])


def downgrade() -> None:
    op.drop_index("ix_event_subscription", table_name="events")
    with op.batch_alter_table("events") as batch:
        batch.drop_column("subscription_id")
    op.drop_index("ix_subscription_subcat", table_name="subscriptions")
    op.drop_index("ix_subscription_client", table_name="subscriptions")
    op.drop_table("subscriptions")
