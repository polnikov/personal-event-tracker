from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Integer, ForeignKey, DateTime, Numeric, Text, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    color: Mapped[str] = mapped_column(String(7), default="#3b82f6")
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    google_calendar_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    subcategories: Mapped[list["Subcategory"]] = relationship(
        back_populates="category", cascade="all, delete-orphan"
    )


class Subcategory(Base):
    __tablename__ = "subcategories"
    __table_args__ = (Index("ix_subcat_category", "category_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

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
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    subcategory: Mapped[Subcategory] = relationship(back_populates="prices")


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), default="")
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    telegram: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    events: Mapped[list["Event"]] = relationship(back_populates="client")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_event_start", "start_at"),
        Index("ix_event_client", "client_id"),
        Index("ix_event_subcat", "subcategory_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    subcategory_id: Mapped[int] = mapped_column(ForeignKey("subcategories.id"))
    client_id: Mapped[int | None] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"), nullable=True
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
    google_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    subcategory: Mapped[Subcategory] = relationship(back_populates="events")
    client: Mapped[Client | None] = relationship(back_populates="events")

    @property
    def end_at(self) -> datetime:
        from datetime import timedelta
        return self.start_at + timedelta(minutes=self.duration_minutes)
