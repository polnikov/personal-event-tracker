import { v4 as uuidv4 } from "uuid";

import { db, type IdMapEntry, type OutboxEntry } from "./db";

/** Mutation we want to send to the server (eventually). */
export interface EnqueueOp {
  method: OutboxEntry["method"];
  /** Path WITHOUT the /api prefix — flushers prepend it. */
  url: string;
  body?: unknown;
  /** Caller-provided idempotency key; if absent a fresh uuid is used. */
  idempotencyKey?: string;
  /** Other outbox ids this op depends on (Phase 4 wiring). */
  dependsOn?: string[];
}

// ───────────────────────── monotonic timestamp ─────────────────────────

// Date.now() has 1-ms resolution; two enqueues in the same tick would tie
// and Dexie's orderBy("ts") wouldn't guarantee FIFO. Keep a tiny monotonic
// counter so each entry sorts strictly after the previous one.
let _lastTs = 0;
function nextTs(): number {
  const t = Math.max(Date.now(), _lastTs + 1);
  _lastTs = t;
  return t;
}

// ───────────────────────── change subscription ─────────────────────────

const subscribers = new Set<() => void>();

/** Subscribe to outbox changes. Returns an unsubscribe function. */
export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function notify(): void {
  for (const cb of subscribers) cb();
}

// ───────────────────────── CRUD on outbox entries ─────────────────────────

export async function enqueue(op: EnqueueOp): Promise<OutboxEntry> {
  const entry: OutboxEntry = {
    id: uuidv4(),
    ts: nextTs(),
    method: op.method,
    url: op.url,
    body: op.body,
    idempotencyKey: op.idempotencyKey ?? uuidv4(),
    dependsOn: op.dependsOn,
    attempts: 0,
    status: "pending",
    v: 1,
  };
  await db.outbox.add(entry);
  notify();
  return entry;
}

export async function list(filter?: OutboxEntry["status"]): Promise<OutboxEntry[]> {
  const all = await db.outbox.orderBy("ts").toArray();
  return filter ? all.filter((e) => e.status === filter) : all;
}

export async function peek(): Promise<OutboxEntry | undefined> {
  // Earliest pending entry — index on `ts` keeps this fast at small scale.
  return await db.outbox.orderBy("ts").filter((e) => e.status === "pending").first();
}

export async function ack(id: string): Promise<void> {
  await db.outbox.delete(id);
  notify();
}

export async function fail(id: string, error: string): Promise<void> {
  await db.outbox.update(id, { status: "failed", lastError: error });
  notify();
}

export async function bumpAttempt(id: string, error?: string): Promise<void> {
  const entry = await db.outbox.get(id);
  if (!entry) return;
  await db.outbox.update(id, { attempts: entry.attempts + 1, lastError: error });
  notify();
}

export async function retry(id: string): Promise<void> {
  await db.outbox.update(id, { status: "pending", lastError: undefined });
  notify();
}

export async function count(filter?: OutboxEntry["status"]): Promise<number> {
  if (!filter) return await db.outbox.count();
  return await db.outbox.where("status").equals(filter).count();
}

export async function clearAll(): Promise<void> {
  await db.outbox.clear();
  notify();
}

// ───────────────────────── tmpId → realId map ─────────────────────────

export async function recordIdMapping(
  tmpId: string,
  realId: number,
  kind: IdMapEntry["kind"],
): Promise<void> {
  await db.idMap.put({ tmpId, realId, kind, v: 1 });
}

export async function resolveId(tmpId: string): Promise<IdMapEntry | undefined> {
  return await db.idMap.get(tmpId);
}
