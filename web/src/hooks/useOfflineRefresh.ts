import { useQueryClient, type QueryKey } from "@tanstack/react-query";

import { OfflineQueuedError } from "@/lib/api";

/**
 * Returns a `useMutation` onError handler that treats `OfflineQueuedError`
 * as a soft success: the queued op will be replayed by the sync daemon,
 * so the matching React Query keys are invalidated so the UI refreshes
 * once the row is real. Anything else bubbles through to the caller.
 */
export function useOfflineRefresh(
  queryKey: QueryKey,
  passthrough?: (err: Error) => void,
): (err: Error) => void {
  const qc = useQueryClient();
  return (err: Error) => {
    if (err instanceof OfflineQueuedError) {
      qc.invalidateQueries({ queryKey });
      return;
    }
    passthrough?.(err);
  };
}
