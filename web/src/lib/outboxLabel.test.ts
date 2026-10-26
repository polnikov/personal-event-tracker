import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { eventLabel, lookupsFromCache, type OutboxLookups } from "./outboxLabel";

const lookups = (
  clients: Record<number, string> = {},
  events: Record<number, ReturnType<OutboxLookups["findEvent"]>> = {},
): OutboxLookups => ({
  clientName: (id) => clients[id],
  findEvent: (id) => events[id],
});

describe("eventLabel", () => {
  it("names the client and the time span of a queued edit", () => {
    const label = eventLabel(
      {
        url: "/events/1855",
        body: { client_id: 7, start_at: "2026-09-15T13:00:00", duration_minutes: 60 },
      },
      lookups({ 7: "Иванов Иван" }),
    );
    expect(label).toEqual({ client: "Иванов Иван", when: "15 сент. 2026, 13:00–14:00" });
  });

  it("covers a new event too", () => {
    const label = eventLabel(
      {
        url: "/events",
        body: { client_id: null, start_at: "2026-09-16T09:30:00", duration_minutes: 90 },
      },
      lookups(),
    );
    expect(label).toEqual({ client: "Без клиента", when: "16 сент. 2026, 09:30–11:00" });
  });

  it("takes a delete's details from the cached event", () => {
    const label = eventLabel(
      { url: "/events/3", body: undefined },
      lookups(
        {},
        {
          3: {
            client_id: 2,
            client: { id: 2, full_name: "Петров Пётр" },
            start_at: "2026-09-17T18:00:00",
            duration_minutes: 45,
          },
        },
      ),
    );
    expect(label).toEqual({ client: "Петров Пётр", when: "17 сент. 2026, 18:00–18:45" });
  });

  it("prefers the payload's client over the cached one", () => {
    const label = eventLabel(
      {
        url: "/events/3",
        body: { client_id: 9, start_at: "2026-09-17T18:00:00", duration_minutes: 60 },
      },
      lookups(
        {},
        {
          3: {
            client_id: 2,
            client: { id: 2, full_name: "Петров Пётр" },
            start_at: "2026-09-17T18:00:00",
            duration_minutes: 60,
          },
        },
      ),
    );
    expect(label?.client).toBe("Клиент #9");
  });

  it("returns null when nothing is known or the url is not an event", () => {
    expect(eventLabel({ url: "/events/3", body: undefined }, lookups())).toBeNull();
    expect(
      eventLabel({ url: "/clients", body: { first_name: "А", last_name: "Б" } }, lookups()),
    ).toBeNull();
  });
});

describe("lookupsFromCache", () => {
  it("reads clients and events out of the query cache", () => {
    const qc = new QueryClient();
    qc.setQueryData(["clients", ""], [{ id: 7, full_name: "Иванов Иван" }]);
    qc.setQueryData(["events", "list"], {
      future: [{ id: 5, client_id: 7, start_at: "2026-09-20T10:00:00", duration_minutes: 60 }],
      past: [],
    });
    qc.setQueryData(["events", "detail", 6], {
      id: 6,
      client_id: null,
      start_at: "2026-09-21T10:00:00",
      duration_minutes: 30,
    });
    const l = lookupsFromCache(qc);
    expect(l.clientName(7)).toBe("Иванов Иван");
    expect(l.findEvent(5)?.start_at).toBe("2026-09-20T10:00:00");
    expect(l.findEvent(6)?.duration_minutes).toBe(30);
    expect(l.findEvent(99)).toBeUndefined();
  });
});
