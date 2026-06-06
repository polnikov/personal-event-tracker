import { describe, expect, it } from "vitest";
import type { Category, Subcategory } from "@/types/api";
import { defaultClubValue, findCategoryForSubcat } from "./clubAutofill";

function sub(id: number): Subcategory {
  return { id, category_id: 0, name: `S${id}`, icon: null, prices: [], current_price: null };
}

function cat(id: number, subIds: number[], defaultClubId: number | null): Category {
  return {
    id,
    name: `C${id}`,
    color: "#000",
    icon: null,
    google_calendar_id: null,
    default_club_id: defaultClubId,
    subcategories: subIds.map(sub),
  };
}

const CATS = [cat(1, [10, 11], 100), cat(2, [20], null)];

describe("findCategoryForSubcat", () => {
  it("returns the category owning the subcategory", () => {
    expect(findCategoryForSubcat(CATS, 11)?.id).toBe(1);
    expect(findCategoryForSubcat(CATS, 20)?.id).toBe(2);
  });

  it("returns undefined for an unknown subcategory", () => {
    expect(findCategoryForSubcat(CATS, 999)).toBeUndefined();
  });

  it("tolerates an undefined categories list", () => {
    expect(findCategoryForSubcat(undefined, 10)).toBeUndefined();
  });
});

describe("defaultClubValue", () => {
  it("returns the default club id as a string when set", () => {
    expect(defaultClubValue(CATS[0])).toBe("100");
  });

  it("returns empty string when the category has no default club", () => {
    expect(defaultClubValue(CATS[1])).toBe("");
  });

  it("returns empty string for an undefined category", () => {
    expect(defaultClubValue(undefined)).toBe("");
  });
});
