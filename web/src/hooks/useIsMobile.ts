import { useEffect, useState } from "react";

export function useIsMobile(breakpoint = 640) {
  const [mob, setMob] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia(`(max-width: ${breakpoint}px)`).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setMob(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return mob;
}
