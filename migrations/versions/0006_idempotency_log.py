"""idempotency log

Revision ID: 0006_idempotency_log
Revises: 0005_outbox_summary
"""
from alembic import op
import sqlalchemy as sa


revision = "0006_idempotency_log"
down_revision = "0005_outbox_summary"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "idempotency_log",
        sa.Column("key", sa.String(length=64), primary_key=True),
        sa.Column("method", sa.String(length=8), nullable=False),
        sa.Column("path", sa.String(length=255), nullable=False),
        sa.Column("status", sa.Integer(), nullable=False),
        sa.Column("response_json", sa.Text(), nullable=False, server_default="null"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_idempotency_created", "idempotency_log", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_idempotency_created", table_name="idempotency_log")
    op.drop_table("idempotency_log")
