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
    subcategories: list[SubcategoryRead] = []


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str = "#0969da"
    icon: str | None = None


class CategoryUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str
    icon: str | None = None


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


class EventRead(BaseModel):
    id: int
    subcategory_id: int
    client_id: int | None
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


class EventCreate(BaseModel):
    subcategory_id: int
    client_id: int | None = None
    start_at: datetime
    duration_minutes: int = Field(gt=0)
    notes: str | None = None
    price_per_hour: Decimal | None = Field(default=None, ge=0)
    tax: Decimal = Field(default=Decimal(0), ge=0, le=100)
    royalty: Decimal = Field(default=Decimal(0), ge=0, le=100)


class EventUpdate(BaseModel):
    subcategory_id: int
    client_id: int | None = None
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


class DashboardResponse(BaseModel):
    period: str
    period_label: str
    total_count: int
    total_minutes: int
    total_cost: Decimal
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


class ReportResponse(BaseModel):
    by_subcategory: list[ReportSubcatStat]
    monthly: list[ReportMonthly]
    events_with_royalty: list[EventRead]


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
