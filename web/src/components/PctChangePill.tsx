import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";

interface Props {
  current: number;
  previous: number | null | undefined;
  /** Tooltip prefix for the previous-period sum (default "Прошлый период"). */
  prevLabel?: string;
  /** Tooltip unit suffix after the previous value (default "₽"). */
  unit?: string;
  /** Custom formatter for the previous value in the tooltip — overrides
   *  the default {@link fmt.money}. Used by non-money cards (hours, etc.). */
  formatPrev?: (n: number) => string;
  className?: string;
}

/**
 * Top-right corner chip on chart cards: period-over-period % delta vs the
 * previous comparable window. Green when income grew, red when it shrank,
 * neutral grey at exactly 0%. Returns null when there's no meaningful
 * baseline (prev=null/undefined, or prev=0 with cur>0 — would otherwise
 * paint a misleading +∞% / +100% sentinel).
 */
export function PctChangePill({
  current,
  previous,
  prevLabel,
  unit = "₽",
  formatPrev,
  className,
}: Props) {
  if (previous == null) return null;
  if (previous === 0 && current === 0) {
    return <span className={cn("card-head-pct neutral", className)}>0%</span>;
  }
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const tone = pct > 0 ? "up" : pct < 0 ? "down" : "neutral";
  const sign = pct > 0 ? "+" : "";
  const prevText = formatPrev ? formatPrev(previous) : fmt.money(previous);
  const title = `${prevLabel ?? "Прошлый период"}: ${prevText} ${unit}`;
  return (
    <span className={cn("card-head-pct", tone, className)} title={title}>
      {sign}{pct.toFixed(1)}%
    </span>
  );
}
