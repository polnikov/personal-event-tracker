import type { Subcategory } from "@/types/api";

/**
 * Hourly price effective at `startAtMs` for a subcategory: the most recent
 * price row whose effective_from ≤ startAtMs, falling back to current_price.
 * Mirrors the backend's get_price_at. Returns a number (0 if nothing applies).
 */
export function effectivePrice(sub: Subcategory, startAtMs: number): number {
  const applicable = (sub.prices ?? [])
    .filter((p) => new Date(p.effective_from).getTime() <= startAtMs)
    .sort(
      (a, b) =>
        new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime(),
    )[0];
  const priceStr = applicable?.price_per_hour ?? sub.current_price;
  return priceStr ? parseFloat(priceStr) || 0 : 0;
}

export interface EventCalcInput {
  price: number;
  minutes: number;
  tax: number;
  royalty: number;
  /** When false the corresponding amount is forced to 0 (toggle off in the form). */
  taxEnabled?: boolean;
  royaltyEnabled?: boolean;
}

export interface EventCalc {
  gross: number;
  taxAmt: number;
  royaltyAmt: number;
  net: number;
}

/**
 * Live money breakdown for the event form: gross = price·minutes/60, then tax
 * and royalty as percentages of gross, net = gross − tax − royalty. Matches the
 * backend net formula total·(1 − tax/100 − royalty/100).
 */
export function calcEvent({
  price,
  minutes,
  tax,
  royalty,
  taxEnabled = true,
  royaltyEnabled = true,
}: EventCalcInput): EventCalc {
  const gross = ((Number(price) || 0) * (Number(minutes) || 0)) / 60;
  const taxAmt = taxEnabled ? (gross * (Number(tax) || 0)) / 100 : 0;
  const royaltyAmt = royaltyEnabled ? (gross * (Number(royalty) || 0)) / 100 : 0;
  return { gross, taxAmt, royaltyAmt, net: gross - taxAmt - royaltyAmt };
}
