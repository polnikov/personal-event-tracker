import { useEffect, useState } from "react";

/**
 * Tracks `navigator.onLine` plus the `online`/`offline` browser events.
 * Returns the current connectivity, suitable for showing an offline pill or
 * gating mutation behaviour. Falls back to `true` during SSR / before mount.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
