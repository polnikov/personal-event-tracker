import type { QueryClient } from "@tanstack/react-query";
import { addMinutes, format, isValid, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

import type { OutboxEntry } from "./db";

/** What a queue row shows for an event operation instead of its URL. */
export interface OutboxEventLabel {
  client: string;
  /** "15 сент. 2026, 13:00–14:00" */
  when: string;
}

/** The slice of an event the label needs. Both the create/update payload and
 *  a cached EventItem carry it. */
interface EventFacts {
  client_id?: number | null;
  client?: { id: number; full_name: string } | null;
  start_at?: string;
  duration_minutes?: number;
}

export interface OutboxLookups {
  clientName: (id: number) => string | undefined;
  /** An event already in the query cache. A DELETE has no body, so this is
   *  its only source; for a PUT it backs up a missing client name. */
  findEvent: (id: number) => EventFacts | undefined;
}

const EVENT_URL = /^\/events(?:\/(\d+))?$/;

/** Label for an /events or /events/:id operation, or null for anything else
 *  (and for an event nothing is known about), so the row falls back to the
 *  raw URL. */
export function eventLabel(
  entry: Pick<OutboxEntry, "url" | "body">,
  lookups: OutboxLookups,
): OutboxEventLabel | null {
  const m = EVENT_URL.exec(entry.url);
  if (!m) return null;
  const cached = m[1] ? lookups.findEvent(Number(m[1])) : undefined;
  const body = (entry.body ?? undefined) as EventFacts | undefined;

  const startAt = body?.start_at ?? cached?.start_at;
  if (!startAt) return null;
  const start = parseISO(startAt);
  if (!isValid(start)) return null;
  const minutes = body?.duration_minutes ?? cached?.duration_minutes;

  // The payload wins over the cache: an edit may have switched the client.
  const clientId = body && "client_id" in body ? body.client_id : cached?.client_id;
  let client: string;
  if (clientId == null) {
    client = "Без клиента";
  } else {
    client =
      lookups.clientName(clientId) ??
      (cached?.client?.id === clientId ? cached.client.full_name : undefined) ??
      `Клиент #${clientId}`;
  }

  let when = format(start, "d MMM yyyy, HH:mm", { locale: ru });
  if (minutes) when += `–${format(addMinutes(start, minutes), "HH:mm")}`;
  return { client, when };
}

function isEventFacts(v: unknown): v is EventFacts & { id: number } {
  const o = v as Record<string, unknown> | null;
  return (
    !!o &&
    typeof o.id === "number" &&
    typeof o.start_at === "string" &&
    typeof o.duration_minutes === "number"
  );
}

/** Collects events from any cached ["events", ...] payload: a single event,
 *  a list, or an object of lists (the { future, past } response). */
function collectEvents(data: unknown, into: Map<number, EventFacts>): void {
  if (Array.isArray(data)) {
    for (const item of data) if (isEventFacts(item)) into.set(item.id, item);
    return;
  }
  if (isEventFacts(data)) {
    into.set(data.id, data);
    return;
  }
  if (data && typeof data === "object") {
    for (const v of Object.values(data)) {
      if (Array.isArray(v)) collectEvents(v, into);
    }
  }
}

export function lookupsFromCache(qc: QueryClient): OutboxLookups {
  const clients = new Map<number, string>();
  for (const [, data] of qc.getQueriesData<unknown>({ queryKey: ["clients"] })) {
    if (!Array.isArray(data)) continue;
    for (const c of data as Array<{ id?: unknown; full_name?: unknown }>) {
      if (typeof c?.id === "number" && typeof c.full_name === "string") {
        clients.set(c.id, c.full_name);
      }
    }
  }
  const events = new Map<number, EventFacts>();
  for (const [, data] of qc.getQueriesData<unknown>({ queryKey: ["events"] })) {
    collectEvents(data, events);
  }
  return {
    clientName: (id) => clients.get(id),
    findEvent: (id) => events.get(id),
  };
}
