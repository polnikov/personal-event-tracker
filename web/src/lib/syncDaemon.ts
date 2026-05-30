import type { QueryClient } from "@tanstack/react-query";

import type { OutboxEntry } from "./db";
import { ack, bumpAttempt, fail, peek } from "./outbox";

const API_BASE = "/api";

let flushing = false;
let qc: QueryClient | null = null;

/** Start the daemon: listens for `online` and flushes the queue, also runs
 *  once immediately if we're online. Returns a cleanup function. */
export function startSyncDaemon(client: QueryClient): () => void {
  qc = client;
  const onOnline = () => {
    void flush();
  };
  window.addEventListener("online", onOnline);
  if (typeof navigator !== "undefined" && navigator.onLine) {
    void flush();
  }
  return () => {
    window.removeEventListener("online", onOnline);
  };
}

/** Drain the queue sequentially. Stops on network failure / 5xx so the
 *  remaining entries are retried on the next `online` event. */
export async function flush(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  flushing = true;
  try {
    let entry = await peek();
    while (entry) {
      const keepGoing = await deliver(entry);
      if (!keepGoing) break;
      if (typeof navigator !== "undefined" && !navigator.onLine) break;
      entry = await peek();
    }
  } finally {
    flushing = false;
  }
}

/** Returns true when the daemon should continue to the next entry. */
async function deliver(entry: OutboxEntry): Promise<boolean> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${entry.url}`, {
      method: entry.method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": entry.idempotencyKey,
      },
      body: entry.body !== undefined ? JSON.stringify(entry.body) : undefined,
    });
  } catch (err) {
    // Network failure → keep the entry, retry later.
    await bumpAttempt(entry.id, err instanceof Error ? err.message : String(err));
    return false;
  }
  if (res.ok) {
    await ack(entry.id);
    invalidateForUrl(entry.url);
    return true;
  }
  if (res.status >= 400 && res.status < 500) {
    // Permanent client error (e.g. validation / conflict). Mark failed and
    // move on; Phase 4 surfaces it in a conflict modal.
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body && typeof body.detail === "string") detail = body.detail;
    } catch {
      /* ignore */
    }
    await fail(entry.id, detail);
    return true;
  }
  // 5xx — transient, retry on next online event.
  await bumpAttempt(entry.id, `HTTP ${res.status}`);
  return false;
}

function invalidateForUrl(url: string): void {
  if (!qc) return;
  if (url.startsWith("/events")) {
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["calendar"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["report"] });
  } else if (url.startsWith("/clients")) {
    qc.invalidateQueries({ queryKey: ["clients"] });
  } else if (url.startsWith("/categories")) {
    qc.invalidateQueries({ queryKey: ["categories"] });
  }
}
