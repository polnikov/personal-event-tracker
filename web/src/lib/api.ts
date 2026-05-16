import type {
  AuthMe,
  CalendarEvent,
  Category,
  Client,
  ClientDetail,
  DashboardResponse,
  EventItem,
  EventListResponse,
  ReportResponse,
  Subcategory,
  SubcategoryPrice,
  UpcomingEvent,
} from "@/types/api";

const API_BASE = "/api";

class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
    ...init,
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    const message =
      (body as { detail?: string } | null)?.detail ||
      `HTTP ${res.status} ${res.statusText}`;
    throw new ApiError(message, res.status, body);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return undefined as T;
  return (await res.json()) as T;
}

export { ApiError };

// ---------- Auth ----------

export const auth = {
  me: () => request<AuthMe>("/auth/me"),
  login: (username: string, password: string) =>
    request<AuthMe>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
};

// ---------- Clients ----------

export interface ClientPayload {
  first_name: string;
  last_name: string;
  phone: string;
  telegram: string;
  notes: string;
}

export const clients = {
  list: (q = "") => request<Client[]>(`/clients${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  detail: (id: number) => request<ClientDetail>(`/clients/${id}`),
  create: (payload: ClientPayload) =>
    request<Client>("/clients", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: number, payload: ClientPayload) =>
    request<Client>(`/clients/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  remove: (id: number) => request<{ ok: true }>(`/clients/${id}`, { method: "DELETE" }),
  monthly: (id: number, year: number) =>
    request<{ year: number; values: number[] }>(`/clients/${id}/monthly?year=${year}`),
};

// ---------- Categories ----------

export const categories = {
  list: () => request<Category[]>("/categories"),
  create: (payload: { name: string; color: string; icon: string | null }) =>
    request<Category>("/categories", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: number, payload: { name: string; color: string; icon: string | null }) =>
    request<Category>(`/categories/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  remove: (id: number) => request<{ ok: true }>(`/categories/${id}`, { method: "DELETE" }),
  createSubcategory: (
    catId: number,
    payload: {
      name: string;
      initial_price: number;
      icon: string | null;
      effective_from: string | null;
    },
  ) =>
    request<Subcategory>(`/categories/${catId}/subcategories`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  removeSubcategory: (subId: number) =>
    request<{ ok: true }>(`/categories/subcategories/${subId}`, { method: "DELETE" }),
  addPrice: (subId: number, payload: { price_per_hour: number; effective_from: string }) =>
    request<SubcategoryPrice>(`/categories/subcategories/${subId}/prices`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

// ---------- Events ----------

export interface EventFilters {
  category_id?: number;
  subcategory_id?: number;
  client_id?: number;
  date_from?: string;
  date_to?: string;
}

function buildQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const events = {
  list: (filters: EventFilters = {}) =>
    request<EventListResponse>(`/events${buildQuery({ ...filters })}`),
  upcoming: (limit = 10) => request<UpcomingEvent[]>(`/events/upcoming?limit=${limit}`),
  detail: (id: number) => request<EventItem>(`/events/${id}`),
  create: (payload: {
    subcategory_id: number;
    client_id: number | null;
    start_at: string;
    duration_minutes: number;
    notes: string | null;
    price_per_hour: number | null;
    tax: number;
    royalty: number;
  }) => request<EventItem>("/events", { method: "POST", body: JSON.stringify(payload) }),
  update: (
    id: number,
    payload: {
      subcategory_id: number;
      client_id: number | null;
      start_at: string;
      duration_minutes: number;
      notes: string | null;
      recalculate_price: boolean;
      price_per_hour: number | null;
      tax: number;
      royalty: number;
    },
  ) => request<EventItem>(`/events/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  remove: (id: number) => request<{ ok: true }>(`/events/${id}`, { method: "DELETE" }),
};

// ---------- Dashboard ----------

export const dashboard = {
  fetch: (params: {
    period?: string;
    date_from?: string;
    date_to?: string;
    category_id?: number;
    subcategory_id?: number;
    client_id?: number;
  }) => request<DashboardResponse>(`/dashboard${buildQuery(params)}`),
};

// ---------- Reports ----------

export const reports = {
  fetch: (params: { year: number; month: number; category_id?: number }) =>
    request<ReportResponse>(
      `/reports${buildQuery({
        year: params.year,
        month: params.month,
        category_id: params.category_id,
      })}`,
    ),
  years: () => request<{ years: number[] }>("/reports/years"),
};

// ---------- Calendar ----------

export const calendar = {
  feed: (start: string, end: string, clientId?: number) => {
    const q = new URLSearchParams({ start, end });
    if (clientId) q.set("client_id", String(clientId));
    return request<CalendarEvent[]>(`/calendar/feed?${q.toString()}`);
  },
};
