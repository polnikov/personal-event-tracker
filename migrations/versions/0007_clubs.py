"""clubs + category.default_club_id + event.club_id

Revision ID: 0007_clubs
Revises: 0006_idempotency_log
"""
from alembic import op
import sqlalchemy as sa


revision = "0007_clubs"
down_revision = "0006_idempotency_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clubs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    # Plain nullable columns — SQLite doesn't enforce FKs added via ALTER, and
    # the ORM-level ForeignKey on the models is enough for joins/relationships.
    op.add_column("categories", sa.Column("default_club_id", sa.Integer(), nullable=True))
    op.add_column("events", sa.Column("club_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("events") as batch:
        batch.drop_column("club_id")
    with op.batch_alter_table("categories") as batch:
        batch.drop_column("default_club_id")
    op.drop_table("clubs")
