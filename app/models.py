from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Integer, ForeignKey, DateTime, Numeric, Text, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .clock import now_local
from .database import Base


class Club(Base):
    """A venue/location an event can take place at. Optional on events; a
    category may carry a default club that auto-fills new events."""

    __tablename__ = "clubs"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    color: Mapped[str] = mapped_column(String(7), default="#3b82f6")
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    google_calendar_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Club pre-selected for events created under this category (optional).
    default_club_id: Mapped[int | None] = mapped_column(
        ForeignKey("clubs.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local)

    subcategories: Mapped[list["Subcategory"]] = relationship(
        back_populates="category", cascade="all, delete-orphan"
    )
    default_club: Mapped["Club | None"] = relationship("Club")


class Subcategory(Base):
    __tablename__ = "subcategories"
    __table_args__ = (Index("ix_subcat_category", "category_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local)

    category: Mapped[Category] = relationship(back_populates="subcategories")
    prices: Mapped[list["SubcategoryPrice"]] = relationship(
        back_populates="subcategory",
        cascade="all, delete-orphan",
        order_by="SubcategoryPrice.effective_from.desc()",
    )
    events: Mapped[list["Event"]] = relationship(back_populates="subcategory")


class SubcategoryPrice(Base):
    """Price history. Each row is the hourly price effective from `effective_from` onwards
    until the next row (by date) for the same subcategory."""

    __tablename__ = "subcategory_prices"
    __table_args__ = (Index("ix_price_subcat_date", "subcategory_id", "effective_from"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    subcategory_id: Mapped[int] = mapped_column(
        ForeignKey("subcategories.id", ondelete="CASCADE")
    )
    price_per_hour: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    effective_from: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local)

    subcategory: Mapped[Subcategory] = relationship(back_populates="prices")


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), default="")
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    telegram: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local)

    events: Mapped[list["Event"]] = relationship(back_populates="client")
    subscriptions: Mapped[list["Subscription"]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )

    @property
    def full_name(self) -> str:
        return f"{self.last_name} {self.first_name}".strip()


class Subscription(Base):
    """Prepaid package of lessons bought by a client for one subcategory.

    One "занятие" equals one hour, so a 90-minute event consumes 1.5 lessons
    and `price_per_lesson` doubles as the hourly rate for events booked
    against the package. Balances are derived from the linked events (see
    app/subscriptions.py) rather than stored, so they can never drift."""

    __tablename__ = "subscriptions"
    __table_args__ = (
        Index("ix_subscription_client", "client_id"),
        Index("ix_subscription_subcat", "subcategory_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    subcategory_id: Mapped[int] = mapped_column(
        ForeignKey("subcategories.id", ondelete="CASCADE"), nullable=False
    )
    lessons_total: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    price_per_lesson: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local)

    client: Mapped[Client] = relationship(back_populates="subscriptions")
    subcategory: Mapped[Subcategory] = relationship()
    # Load-bearing: SQLite doesn't enforce ON DELETE SET NULL, so this
    # relationship is what lets SQLAlchemy null out events.subscription_id
    # when a package is deleted.
    events: Mapped[list["Event"]] = relationship(back_populates="subscription")


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_event_start", "start_at"),
        Index("ix_event_client", "client_id"),
        Index("ix_event_subcat", "subcategory_id"),
        Index("ix_event_subscription", "subscription_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    subcategory_id: Mapped[int] = mapped_column(ForeignKey("subcategories.id"))
    client_id: Mapped[int | None] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"), nullable=True
    )
    club_id: Mapped[int | None] = mapped_column(
        ForeignKey("clubs.id", ondelete="SET NULL"), nullable=True
    )
    # Set when the event is paid out of a prepaid package. The package price
    # then acts as hourly_rate_snapshot and the event consumes
    # duration_minutes from the package balance once it has ended.
    subscription_id: Mapped[int | None] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="SET NULL"), nullable=True
    )
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)

    # Snapshot fields — frozen at creation, immune to later price changes.
    hourly_rate_snapshot: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    # Percentages applied on top of total_cost (0..100). Net = total - tax% - royalty%.
    tax: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, server_default="0")
    royalty: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, server_default="0")

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Snapshot of where the event lives in Google after a successful sync.
    # Lets us detect "category changed → calendar changed" so we can issue
    # delete-old + create-new instead of a futile patch on the wrong cal.
    google_calendar_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=now_local, onupdate=now_local
    )

    subcategory: Mapped[Subcategory] = relationship(back_populates="events")
    client: Mapped[Client | None] = relationship(back_populates="events")
    club: Mapped["Club | None"] = relationship("Club")
    subscription: Mapped["Subscription | None"] = relationship(back_populates="events")

    @property
    def end_at(self) -> datetime:
        from datetime import timedelta
        return self.start_at + timedelta(minutes=self.duration_minutes)


class GoogleAccount(Base):
    """Single-row table holding the connected Google account's credentials.
    The app is single-user, so we don't index by user_id."""

    __tablename__ = "google_account"

    id: Mapped[int] = mapped_column(primary_key=True)
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    access_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expiry: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    scopes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    connected_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=now_local, onupdate=now_local
    )


class GoogleSyncOutbox(Base):
    """Pending Google Calendar mutations, processed in order by the worker.
    Rows persist after completion (completed_at != NULL) so the Debug UI
    can show a history of past syncs and their errors."""

    __tablename__ = "google_sync_outbox"
    __table_args__ = (
        Index("ix_outbox_pending", "completed_at", "next_attempt_at"),
        Index("ix_outbox_event", "event_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"), nullable=True
    )
    op: Mapped[str] = mapped_column(String(16), nullable=False)  # create | update | delete
    calendar_id: Mapped[str] = mapped_column(String(255), nullable=False)
    google_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_local
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Snapshotted human-readable label ("Категория | Подкатегория · Клиент"),
    # captured at enqueue time so the Debug UI can still show what the row was
    # about after the underlying event is deleted (event_id → NULL).
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class IdempotencyLog(Base):
    """Cached response for a mutation, keyed by the client's Idempotency-Key
    header. Lets the offline outbox replay a request without producing dupes."""

    __tablename__ = "idempotency_log"
    __table_args__ = (Index("ix_idempotency_created", "created_at"),)

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    method: Mapped[str] = mapped_column(String(8), nullable=False)
    path: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[int] = mapped_column(Integer, nullable=False)
    # JSON-serialised response body ("null" for 204 / empty bodies).
    response_json: Mapped[str] = mapped_column(Text, nullable=False, default="null")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local)
