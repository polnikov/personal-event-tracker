from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict


# ---------- Auth ----------

class LoginRequest(BaseModel):
    username: str
    password: str


class AuthMe(BaseModel):
    username: str | None = None
    authenticated: bool


# ---------- Clients ----------

class ClientBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(default="", max_length=100)
    phone: str | None = None
    telegram: str | None = None
    notes: str | None = None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(ClientBase):
    pass


class ClientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str
    last_name: str
    full_name: str
    phone: str | None
    telegram: str | None
    notes: str | None
    created_at: datetime
    events_count: int = 0
    total_spent: Decimal = Decimal(0)


# ---------- Clubs ----------

class ClubBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    address: str | None = None


class ClubCreate(ClubBase):
    pass


class ClubUpdate(ClubBase):
    pass


class ClubRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    address: str | None = None
    created_at: datetime


# ---------- Categories / Subcategories / Prices ----------

class SubcategoryPriceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subcategory_id: int
    price_per_hour: Decimal
    effective_from: datetime
    created_at: datetime


class SubcategoryPriceCreate(BaseModel):
    price_per_hour: Decimal = Field(gt=0)
    effective_from: datetime


class SubcategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    name: str
    icon: str | None = None
    prices: list[SubcategoryPriceRead] = []
    current_price: Decimal | None = None


class SubcategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    initial_price: Decimal = Field(gt=0)
    icon: str | None = None
    effective_from: datetime | None = None


class SubcategoryUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    icon: str | None = None


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str
    icon: str | None = None
    google_calendar_id: str | None = None
    default_club_id: int | None = None
    subcategories: list[SubcategoryRead] = []


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str = "#0969da"
    icon: str | None = None
    google_calendar_id: str | None = None
    default_club_id: int | None = None


class CategoryUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str
    icon: str | None = None
    google_calendar_id: str | None = None
    default_club_id: int | None = None


# ---------- Events ----------

class EventClient(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str


class EventSubcategory(BaseModel):
    id: int
    name: str
    category_id: int
    category_name: str
    category_color: str


class EventClub(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    address: str | None = None


class EventRead(BaseModel):
    id: int
    subcategory_id: int
    client_id: int | None
    club_id: int | None = None
    start_at: datetime
    end_at: datetime
    duration_minutes: int
    hourly_rate_snapshot: Decimal
    total_cost: Decimal
    tax: Decimal = Decimal(0)
    royalty: Decimal = Decimal(0)
    notes: str | None
    subcategory: EventSubcategory
    client: EventClient | None = None
    club: EventClub | None = None
    # Computed from open google_sync_outbox rows (see serializers.py).
    # "ok" — no pending sync, or category isn't synced to Google.
    # "pending" — at least one open outbox row with attempts < threshold.
    # "failed" — at least one open outbox row with attempts ≥ threshold.
    sync_status: str = "ok"


class EventCreate(BaseModel):
    subcategory_id: int
    client_id: int | None = None
    club_id: int | None = None
    start_at: datetime
    duration_minutes: int = Field(gt=0)
    notes: str | None = None
    price_per_hour: Decimal | None = Field(default=None, ge=0)
    tax: Decimal = Field(default=Decimal(0), ge=0, le=100)
    royalty: Decimal = Field(default=Decimal(0), ge=0, le=100)


class EventUpdate(BaseModel):
    subcategory_id: int
    client_id: int | None = None
    club_id: int | None = None
    start_at: datetime
    duration_minutes: int = Field(gt=0)
    notes: str | None = None
    recalculate_price: bool = False
    price_per_hour: Decimal | None = Field(default=None, ge=0)
    tax: Decimal = Field(default=Decimal(0), ge=0, le=100)
    royalty: Decimal = Field(default=Decimal(0), ge=0, le=100)


class EventListResponse(BaseModel):
    future: list[EventRead]
    past: list[EventRead]


class UpcomingEvent(BaseModel):
    id: int
    start_at: datetime
    category_name: str
    subcategory_name: str
    client_name: str | None = None


# ---------- Dashboard ----------

class DashboardCategoryStat(BaseModel):
    name: str
    color: str
    count: int
    minutes: int
    cost: Decimal


class DashboardSubcategoryStat(BaseModel):
    name: str
    count: int
    minutes: int
    cost: Decimal


class DashboardClientStat(BaseModel):
    name: str
    count: int
    minutes: int
    cost: Decimal


class DashboardDailySeries(BaseModel):
    name: str
    color: str
    values: list[float]


class DashboardChart(BaseModel):
    labels: list[str]
    values: list[float]
    by_cat_labels: list[str]
    by_cat_values: list[float]
    by_cat_colors: list[str]
    daily_dates: list[str]
    daily_series: list[DashboardDailySeries]
    monthly_labels: list[str]
    monthly_values: list[float]
    # Total income across the previous calendar year — drives the
    # period-over-period % delta on the "Доход по месяцам" card.
    monthly_prev_total: float = 0.0


class DashboardResponse(BaseModel):
    period: str
    period_label: str
    total_count: int
    total_minutes: int
    total_cost: Decimal
    # Income total for the same-shape previous period (previous calendar
    # month/year, or same-length window shifted back for custom). None when
    # period == "all" — there's no meaningful "previous" for an all-time view.
    prev_total_cost: Decimal | None = None
    by_category: list[DashboardCategoryStat]
    by_subcategory: list[DashboardSubcategoryStat]
    by_client: list[DashboardClientStat]
    chart: DashboardChart


# ---------- Reports ----------


class ReportSubcatStat(BaseModel):
    subcategory_id: int
    name: str
    category_name: str
    category_color: str
    hours: float
    net: float


class ReportMonthly(BaseModel):
    month: int  # 1..12
    net: float
    tax_amount: float


class ReportMonthlyCategory(BaseModel):
    category_id: int
    name: str
    color: str
    net: list[float] = []  # 12 monthly net values (Jan..Dec)


class ReportResponse(BaseModel):
    by_subcategory: list[ReportSubcatStat]
    monthly: list[ReportMonthly]
    # Per-category monthly net for the year (multi-line monthly chart shown
    # when no single category is selected).
    monthly_by_category: list[ReportMonthlyCategory] = []
    # 7×12 matrices (rows: Mon..Sun, cols: Jan..Dec) for the year.
    weekday_month: list[list[int]] = []  # event counts
    weekday_month_net: list[list[float]] = []  # net income
    # 7×24 event-count matrix (rows: Mon..Sun, cols: hour 0..23) for the year.
    weekday_hour: list[list[int]] = []
    events_with_royalty: list[EventRead]
    # Period-over-period totals (same filters, shifted back one bucket):
    #  • prev_monthly_net_total — net income for the PREVIOUS calendar year
    #    (drives the % delta on the "Доход по месяцам" card).
    #  • prev_subcategory_net_total — net income for the PREVIOUS calendar
    #    month (drives the delta on "Чистый доход по подкатегориям").
    #  • prev_subcategory_hours_total — total event hours for the PREVIOUS
    #    calendar month (drives the delta on "Часы по подкатегориям").
    prev_monthly_net_total: float = 0.0
    prev_subcategory_net_total: float = 0.0
    prev_subcategory_hours_total: float = 0.0


# ---------- Calendar ----------

class CalendarEvent(BaseModel):
    id: int
    title: str
    start: str
    end: str
    backgroundColor: str
    borderColor: str
    extendedProps: dict


# ---------- Client detail (with stats) ----------

class ClientStatsByCategory(BaseModel):
    name: str
    color: str
    count: int
    minutes: int
    cost: Decimal


class ClientDetailResponse(BaseModel):
    client: ClientRead
    future_events: list[EventRead]
    past_events: list[EventRead]
    total_events: int
    total_minutes: int
    total_cost: Decimal
    by_category: list[ClientStatsByCategory]


# ---------- Google Calendar sync ----------


class GoogleStatus(BaseModel):
    connected: bool
    email: str | None = None
    pending: int = 0
    failed: int = 0
    # Honest credential check: connected means a DB row exists, credentials_valid
    # means the token actually works; reason explains an invalid state.
    credentials_valid: bool = True
    reason: str | None = None


class GoogleCalendarOption(BaseModel):
    id: str
    summary: str
    primary: bool = False
    access_role: str | None = None


class GoogleOutboxRow(BaseModel):
    id: int
    op: str
    calendar_id: str
    event_id: int | None
    event_summary: str | None = None
    client_name: str | None = None
    subcategory_label: str | None = None
    event_start_at: datetime | None = None
    google_event_id: str | None = None
    attempts: int
    last_error: str | None
    created_at: datetime
    completed_at: datetime | None
    next_attempt_at: datetime
