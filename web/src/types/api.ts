export interface AuthMe {
  username: string | null;
  authenticated: boolean;
}

export interface Client {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string | null;
  telegram: string | null;
  notes: string | null;
  created_at: string;
  events_count: number;
  total_spent: string;
}

export interface SubcategoryPrice {
  id: number;
  subcategory_id: number;
  price_per_hour: string;
  effective_from: string;
  created_at: string;
}

export interface Subcategory {
  id: number;
  category_id: number;
  name: string;
  icon: string | null;
  prices: SubcategoryPrice[];
  current_price: string | null;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  subcategories: Subcategory[];
}

export interface EventSubcategoryRef {
  id: number;
  name: string;
  category_id: number;
  category_name: string;
  category_color: string;
}

export interface EventClientRef {
  id: number;
  full_name: string;
}

export interface EventItem {
  id: number;
  subcategory_id: number;
  client_id: number | null;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  hourly_rate_snapshot: string;
  total_cost: string;
  tax: string;
  royalty: string;
  notes: string | null;
  subcategory: EventSubcategoryRef;
  client: EventClientRef | null;
}

export interface EventListResponse {
  future: EventItem[];
  past: EventItem[];
}

export interface UpcomingEvent {
  id: number;
  start_at: string;
  category_name: string;
  subcategory_name: string;
  client_name: string | null;
}

export interface DashboardStat {
  name: string;
  count: number;
  minutes: number;
  cost: string;
  color?: string;
}

export interface DashboardDailySeries {
  name: string;
  color: string;
  values: number[];
}

export interface DashboardChart {
  labels: string[];
  values: number[];
  by_cat_labels: string[];
  by_cat_values: number[];
  by_cat_colors: string[];
  daily_dates: string[];
  daily_series: DashboardDailySeries[];
  monthly_labels: string[];
  monthly_values: number[];
}

export interface DashboardResponse {
  period: string;
  period_label: string;
  total_count: number;
  total_minutes: number;
  total_cost: string;
  by_category: DashboardStat[];
  by_subcategory: DashboardStat[];
  by_client: DashboardStat[];
  chart: DashboardChart;
}

export interface ClientStatsByCategory {
  name: string;
  color: string;
  count: number;
  minutes: number;
  cost: string;
}

export interface ClientDetail {
  client: Client;
  future_events: EventItem[];
  past_events: EventItem[];
  total_events: number;
  total_minutes: number;
  total_cost: string;
  by_category: ClientStatsByCategory[];
}

export interface ReportSubcatStat {
  subcategory_id: number;
  name: string;
  category_name: string;
  category_color: string;
  hours: number;
  net: number;
}

export interface ReportMonthly {
  month: number;
  net: number;
  tax_amount: number;
}

export interface ReportResponse {
  by_subcategory: ReportSubcatStat[];
  monthly: ReportMonthly[];
  events_with_royalty: EventItem[];
}

export interface CalendarEvent {
  id: number;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
  extendedProps: {
    category: string;
    category_icon: string | null;
    category_color: string;
    subcategory: string;
    subcategory_icon: string | null;
    client: string;
    cost: number;
    duration: number;
  };
}
