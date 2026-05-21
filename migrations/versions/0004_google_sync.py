"""google sync: outbox table, account credentials, event calendar snapshot

Revision ID: 0004_google_sync
Revises: 0003_event_tax_royalty
"""
from alembic import op
import sqlalchemy as sa


revision = "0004_google_sync"
down_revision = "0003_event_tax_royalty"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("events") as batch:
        batch.add_column(sa.Column("google_calendar_id", sa.String(length=255), nullable=True))

    op.create_table(
        "google_account",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("refresh_token", sa.Text(), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=True),
        sa.Column("token_expiry", sa.DateTime(), nullable=True),
        sa.Column("scopes", sa.Text(), nullable=False, server_default=""),
        sa.Column("connected_email", sa.String(length=255), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    op.create_table(
        "google_sync_outbox",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "event_id",
            sa.Integer(),
            sa.ForeignKey("events.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("op", sa.String(length=16), nullable=False),
        sa.Column("calendar_id", sa.String(length=255), nullable=False),
        sa.Column("google_event_id", sa.String(length=255), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_outbox_pending",
        "google_sync_outbox",
        ["completed_at", "next_attempt_at"],
    )
    op.create_index("ix_outbox_event", "google_sync_outbox", ["event_id"])


def downgrade() -> None:
    op.drop_index("ix_outbox_event", table_name="google_sync_outbox")
    op.drop_index("ix_outbox_pending", table_name="google_sync_outbox")
    op.drop_table("google_sync_outbox")
    op.drop_table("google_account")
    with op.batch_alter_table("events") as batch:
        batch.drop_column("google_calendar_id")
