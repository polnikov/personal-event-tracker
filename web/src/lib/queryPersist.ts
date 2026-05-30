import { db } from "./db";

// Minimal shape `createAsyncStoragePersister` expects from `storage`. The
// library doesn't export this type publicly in v5, so we mirror it locally.
interface AsyncStorage<T = string> {
  getItem: (key: string) => Promise<T | null | undefined>;
  setItem: (key: string, value: T) => Promise<unknown>;
  removeItem: (key: string) => Promise<void>;
}

/**
 * Dexie-backed implementation of TanStack Query's AsyncStorage. Used by the
 * persistent client so React Query state survives reloads and is available
 * instantly on cold-start offline.
 */
export const queryStorage: AsyncStorage<string> = {
  getItem: async (key: string) => (await db.queryCache.get(key))?.value ?? null,
  setItem: async (key: string, value: string) => {
    await db.queryCache.put({ key, value });
  },
  removeItem: async (key: string) => {
    await db.queryCache.delete(key);
  },
};
