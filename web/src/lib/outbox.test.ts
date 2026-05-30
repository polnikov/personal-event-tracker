import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "./db";
import {
  ack,
  bumpAttempt,
  clearAll,
  count,
  enqueue,
  fail,
  list,
  peek,
  recordIdMapping,
  resolveId,
  retry,
  subscribe,
} from "./outbox";

afterEach(async () => {
  await db.outbox.clear();
  await db.idMap.clear();
});

describe("enqueue + list", () => {
  it("assigns id/ts/idempotencyKey and persists", async () => {
    const entry = await enqueue({ method: "POST", url: "/events", body: { x: 1 } });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(entry.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(entry.status).toBe("pending");
    expect(await count()).toBe(1);
    const all = await list();
    expect(all).toHaveLength(1);
    expect(all[0].body).toEqual({ x: 1 });
  });

  it("preserves a caller-provided idempotencyKey (used for retry)", async () => {
    const entry = await enqueue({
      method: "DELETE", url: "/events/1", idempotencyKey: "fixed-key",
    });
    expect(entry.idempotencyKey).toBe("fixed-key");
  });
});

describe("peek picks earliest pending", () => {
  it("ignores failed entries", async () => {
    const a = await enqueue({ method: "POST", url: "/events", body: { i: 1 } });
    const b = await enqueue({ method: "POST", url: "/events", body: { i: 2 } });
    await fail(a.id, "boom");
    const next = await peek();
    expect(next?.id).toBe(b.id);
  });

  it("returns the entry with the smallest ts", async () => {
    const a = await enqueue({ method: "POST", url: "/events", body: { i: 1 } });
    const b = await enqueue({ method: "POST", url: "/events", body: { i: 2 } });
    expect((await peek())?.id).toBe(a.id);
    await ack(a.id);
    expect((await peek())?.id).toBe(b.id);
  });
});

describe("ack / fail / bumpAttempt / retry", () => {
  it("ack removes the entry", async () => {
    const e = await enqueue({ method: "POST", url: "/x" });
    await ack(e.id);
    expect(await count()).toBe(0);
  });

  it("fail flips status and saves the error", async () => {
    const e = await enqueue({ method: "POST", url: "/x" });
    await fail(e.id, "nope");
    const [stored] = await list();
    expect(stored.status).toBe("failed");
    expect(stored.lastError).toBe("nope");
  });

  it("bumpAttempt increments attempts", async () => {
    const e = await enqueue({ method: "POST", url: "/x" });
    await bumpAttempt(e.id, "tmp");
    const [stored] = await list();
    expect(stored.attempts).toBe(1);
  });

  it("retry resets a failed entry to pending", async () => {
    const e = await enqueue({ method: "POST", url: "/x" });
    await fail(e.id, "err");
    await retry(e.id);
    expect((await peek())?.id).toBe(e.id);
  });
});

describe("subscribe", () => {
  it("notifies on enqueue/ack/fail/clearAll", async () => {
    const cb = vi.fn();
    const unsub = subscribe(cb);
    const e = await enqueue({ method: "POST", url: "/x" });
    await ack(e.id);
    await clearAll();
    expect(cb.mock.calls.length).toBeGreaterThanOrEqual(3);
    unsub();
  });
});

describe("idMap", () => {
  it("round-trips a tmpId → realId mapping", async () => {
    await recordIdMapping("tmp-1", 42, "event");
    const m = await resolveId("tmp-1");
    expect(m).toEqual({ tmpId: "tmp-1", realId: 42, kind: "event", v: 1 });
  });
});
