import Dexie, { type Table } from "dexie";

// Single IndexedDB used for all client-side offline state. Schema is versioned
// inside Dexie so future phases can add stores without losing existing data.

/** Pending mutation queued while offline (or after a network failure). */
export interface OutboxEntry {
  id: string; // client uuid
  ts: number;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  body: unknown;
  idempotencyKey: string;
  /** Other outbox ids this op depends on (e.g. a new event waiting on its
   *  client to be created first). */
  dependsOn?: string[];
  attempts: number;
  lastError?: string;
  status: "pending" | "failed";
  v: 1;
}

/** Mapping from a client-generated tmp id to the server-assigned real id,
 *  written once an offline POST is successfully replayed. */
export interface IdMapEntry {
  tmpId: string;
  realId: number;
  kind: "event" | "client" | "category" | "subcategory" | "price";
  v: 1;
}

/** Async-storage adapter row for the persisted React Query cache. */
export interface QueryCacheEntry {
  key: string;
  value: string;
}

class OfflineDB extends Dexie {
  outbox!: Table<OutboxEntry, string>;
  idMap!: Table<IdMapEntry, string>;
  queryCache!: Table<QueryCacheEntry, string>;

  constructor() {
    super("event_tracker_offline");
    this.version(1).stores({
      // Primary key + secondary indexes used by sync flows.
      outbox: "id, ts, status",
      idMap: "tmpId, kind",
      queryCache: "key",
    });
  }
}

export const db = new OfflineDB();
