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

import { enqueue } from "./outbox";

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

/** Thrown by `request()` when a mutation could not reach the server and was
 *  parked in the outbox instead. Callers should treat it as a soft success
 *  (the op will be replayed once connectivity returns). */
class OfflineQueuedError extends Error {
  path: string;
  method: string;
  idempotencyKey: string;
  constructor(path: string, method: string, idempotencyKey: string) {
    super("Сохранено в очереди для отправки");
    this.name = "OfflineQueuedError";
    this.path = path;
    this.method = method;
    this.idempotencyKey = idempotencyKey;
  }
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Skip outbox for endpoints whose state must always be live (auth/google
 *  flows). They'll just fail in-browser when offline — the UI handles it. */
const NEVER_QUEUE_RE = /^\/(auth|google)(\/|$)/;

function parseBody(body: BodyInit | null | undefined): unknown {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return undefined;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const isMutation = MUTATION_METHODS.has(method);
  const idempotencyKey = isMutation ? crypto.randomUUID() : undefined;
  const canQueue = isMutation && !NEVER_QUEUE_RE.test(path);

  // Offline before we even try → enqueue and bail out as "queued".
  if (canQueue && typeof navigator !== "undefined" && !navigator.onLine) {
    await enqueue({
      method: method as "POST" | "PUT" | "PATCH" | "DELETE",
      url: path,
      body: parseBody(init.body),
      idempotencyKey,
    });
    throw new OfflineQueuedError(path, method, idempotencyKey!);
  }

  const idempotencyHeader: HeadersInit = idempotencyKey
    ? { "Idempotency-Key": idempotencyKey }
    : {};
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...idempotencyHeader,
        ...(init.headers || {}),
      },
    });
  } catch (err) {
    // Network failure mid-request: a mutation can be safely queued (same key,
    // server-side idempotency dedupes if it actually reached the backend).
    if (canQueue && idempotencyKey) {
      await enqueue({
        method: method as "POST" | "PUT" | "PATCH" | "DELETE",
        url: path,
        body: parseBody(init.body),
        idempotencyKey,
      });
      throw new OfflineQueuedError(path, method, idempotencyKey);
    }
    throw err;
  }
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

export { ApiError, OfflineQueuedError };

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
    request<{ year: number; values: number[]; weekday_month: number[][] }>(
      `/clients/${id}/monthly?year=${year}`,
    ),
};

// ---------- Categories ----------

export interface CategoryPayload {
  name: string;
  color: string;
  icon: string | null;
  google_calendar_id?: string | null;
}

export const categories = {
  list: () => request<Category[]>("/categories"),
  create: (payload: CategoryPayload) =>
    request<Category>("/categories", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: number, payload: CategoryPayload) =>
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
  updateSubcategory: (
    subId: number,
    payload: { name: string; icon: string | null },
  ) =>
    request<Subcategory>(`/categories/subcategories/${subId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  removeSubcategory: (subId: number) =>
    request<{ ok: true }>(`/categories/subcategories/${subId}`, { method: "DELETE" }),
  addPrice: (subId: number, payload: { price_per_hour: number; effective_from: string }) =>
    request<SubcategoryPrice>(`/categories/subcategories/${subId}/prices`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updatePrice: (priceId: number, payload: { price_per_hour: number; effective_from: string }) =>
    request<SubcategoryPrice>(`/categories/prices/${priceId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  removePrice: (priceId: number) =>
    request<{ ok: true }>(`/categories/prices/${priceId}`, { method: "DELETE" }),
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

// ---------- Google Calendar sync ----------

export interface GoogleStatus {
  connected: boolean;
  email: string | null;
  pending: number;
  failed: number;
  /** Whether the stored token actually works (not just that a row exists). */
  credentials_valid: boolean;
  /** Explanation when credentials_valid is false. */
  reason: string | null;
}

export interface GoogleCalendarOption {
  id: string;
  summary: string;
  primary: boolean;
  access_role: string | null;
}

export interface GoogleOutboxRow {
  id: number;
  op: "create" | "update" | "delete";
  calendar_id: string;
  event_id: number | null;
  event_summary: string | null;
  client_name: string | null;
  subcategory_label: string | null;
  event_start_at: string | null;
  google_event_id: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  completed_at: string | null;
  next_attempt_at: string;
}

export const google = {
  status: () => request<GoogleStatus>("/google/status"),
  startAuth: () => {
    window.location.assign(`${API_BASE}/google/oauth/start`);
  },
  manualConnect: (payload: { refresh_token: string; email?: string }) =>
    request<{ ok: true; email: string | null }>("/google/manual-connect", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  disconnect: () => request<{ ok: true }>("/google/disconnect", { method: "POST" }),
  listCalendars: () => request<GoogleCalendarOption[]>("/google/calendars"),
  outbox: (params: { status?: "all" | "pending" | "failed"; limit?: number; offset?: number } = {}) =>
    request<GoogleOutboxRow[]>(`/google/outbox${buildQuery(params)}`),
  retryOutbox: (id: number) =>
    request<{ ok: true }>(`/google/outbox/${id}/retry`, { method: "POST" }),
  dismissOutbox: (id: number) =>
    request<{ ok: true }>(`/google/outbox/${id}/dismiss`, { method: "POST" }),
};
