import { describe, expect, it } from "vitest";

import type { Subcategory } from "@/types/api";

import { calcEvent, effectivePrice } from "./eventCalc";

function sub(partial: Partial<Subcategory>): Subcategory {
  return {
    id: 1,
    category_id: 1,
    name: "Персональная",
    icon: null,
    prices: [],
    current_price: null,
    ...partial,
  };
}

const price = (id: number, value: string, effective_from: string) => ({
  id,
  subcategory_id: 1,
  price_per_hour: value,
  effective_from,
  created_at: effective_from,
});

describe("effectivePrice", () => {
  it("picks the most recent price effective on/before the start", () => {
    const s = sub({
      prices: [
        price(1, "100.00", "2024-01-01T00:00:00"),
        price(2, "150.00", "2025-06-01T00:00:00"),
        price(3, "200.00", "2026-06-01T00:00:00"),
      ],
      current_price: "200.00",
    });
    const start = new Date("2025-09-01T10:00:00").getTime();
    expect(effectivePrice(s, start)).toBe(150);
  });

  it("ignores future prices", () => {
    const s = sub({
      prices: [
        price(1, "100.00", "2024-01-01T00:00:00"),
        price(2, "999.00", "2030-01-01T00:00:00"),
      ],
      current_price: "999.00",
    });
    const start = new Date("2026-01-01T00:00:00").getTime();
    expect(effectivePrice(s, start)).toBe(100);
  });

  it("falls back to current_price when no historical row applies", () => {
    const s = sub({
      prices: [price(1, "300.00", "2030-01-01T00:00:00")],
      current_price: "175.50",
    });
    const start = new Date("2026-01-01T00:00:00").getTime();
    expect(effectivePrice(s, start)).toBe(175.5);
  });

  it("returns 0 when there is no price at all", () => {
    expect(effectivePrice(sub({}), Date.now())).toBe(0);
  });
});

describe("calcEvent", () => {
  it("computes gross from price and minutes", () => {
    expect(calcEvent({ price: 100, minutes: 90, tax: 0, royalty: 0 }).gross).toBe(150);
    expect(calcEvent({ price: 250, minutes: 60, tax: 0, royalty: 0 }).gross).toBe(250);
  });

  it("applies tax and royalty as percentages of gross", () => {
    const r = calcEvent({ price: 200, minutes: 60, tax: 10, royalty: 5 });
    expect(r.gross).toBe(200);
    expect(r.taxAmt).toBe(20);
    expect(r.royaltyAmt).toBe(10);
    expect(r.net).toBe(170);
  });

  it("forces amounts to zero when a toggle is disabled", () => {
    const r = calcEvent({
      price: 200,
      minutes: 60,
      tax: 10,
      royalty: 5,
      taxEnabled: false,
      royaltyEnabled: false,
    });
    expect(r.taxAmt).toBe(0);
    expect(r.royaltyAmt).toBe(0);
    expect(r.net).toBe(200);
  });

  it("treats NaN/empty inputs as zero", () => {
    const r = calcEvent({ price: NaN, minutes: 60, tax: NaN, royalty: 0 });
    expect(r.gross).toBe(0);
    expect(r.net).toBe(0);
  });
});
