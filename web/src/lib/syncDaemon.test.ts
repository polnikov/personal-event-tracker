import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { db } from "./db";
import { enqueue, list } from "./outbox";
import { flush, startSyncDaemon } from "./syncDaemon";

function okResponse(body: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function errResponse(status: number, body: unknown = { detail: "nope" }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(async () => {
  await db.outbox.clear();
  await db.idMap.clear();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("flush", () => {
  it("does nothing while offline", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await enqueue({ method: "POST", url: "/events", body: { x: 1 } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await list("pending")).toHaveLength(1);
  });

  it("drains pending entries in FIFO order with the stored idempotency key", async () => {
    const a = await enqueue({ method: "POST", url: "/events", body: { i: 1 } });
    const b = await enqueue({ method: "POST", url: "/clients", body: { i: 2 } });
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await flush();
    expect(fetchMock.mock.calls).toHaveLength(2);
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall[0]).toBe("/api/events");
    const firstInit = firstCall[1] as RequestInit;
    expect(firstInit.method).toBe("POST");
    expect(
      (firstInit.headers as Record<string, string>)["Idempotency-Key"],
    ).toBe(a.idempotencyKey);
    expect(JSON.parse(String(firstInit.body))).toEqual({ i: 1 });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/clients");
    expect(
      ((fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>)[
        "Idempotency-Key"
      ],
    ).toBe(b.idempotencyKey);
    expect(await list()).toHaveLength(0);
  });

  it("marks a 4xx entry failed and continues to the next", async () => {
    const bad = await enqueue({ method: "POST", url: "/events", body: { i: 1 } });
    const good = await enqueue({ method: "POST", url: "/clients", body: { i: 2 } });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errResponse(409))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await flush();
    const remaining = await list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(bad.id);
    expect(remaining[0].status).toBe("failed");
    expect(await db.outbox.get(good.id)).toBeUndefined();
  });

  it("stops on 5xx and bumps the entry for a later retry", async () => {
    const a = await enqueue({ method: "POST", url: "/events", body: { i: 1 } });
    const fetchMock = vi.fn().mockResolvedValue(errResponse(503));
    vi.stubGlobal("fetch", fetchMock);
    await flush();
    const [stored] = await list();
    expect(stored.id).toBe(a.id);
    expect(stored.status).toBe("pending");
    expect(stored.attempts).toBe(1);
  });

  it("stops on a network error and bumps the entry", async () => {
    await enqueue({ method: "POST", url: "/events", body: { i: 1 } });
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    await flush();
    const [stored] = await list();
    expect(stored.status).toBe("pending");
    expect(stored.attempts).toBe(1);
  });

  it("invalidates React Query keys after a successful POST to /events", async () => {
    const qc = new QueryClient();
    startSyncDaemon(qc); // wires invalidation; daemon also runs flush() on start
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    await enqueue({ method: "POST", url: "/events", body: { i: 1 } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));
    await flush();
    expect(invalidate).toHaveBeenCalled();
  });
});
