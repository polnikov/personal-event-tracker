import { describe, expect, it } from "vitest";
import {
  visibleCategories,
  visibleSubcatGroups,
  visibleSubcats,
  visibleSubcatsFlat,
} from "./catVisibility";
import type { Category, Subcategory } from "@/types/api";

function sub(id: number, category_id: number, name: string, hidden = false): Subcategory {
  return { id, category_id, name, icon: null, hidden, prices: [], current_price: null };
}

function cat(id: number, name: string, subs: Subcategory[], hidden = false): Category {
  return {
    id,
    name,
    color: "#3b82f6",
    icon: null,
    hidden,
    google_calendar_id: null,
    default_club_id: null,
    subcategories: subs,
  };
}

const cats: Category[] = [
  cat(1, "Тренировки", [sub(10, 1, "Персональная"), sub(11, 1, "Сплит", true)]),
  cat(2, "Архив", [sub(20, 2, "Старое")], true),
];

describe("catVisibility", () => {
  it("drops hidden categories", () => {
    expect(visibleCategories(cats).map((c) => c.id)).toEqual([1]);
    expect(visibleCategories(undefined)).toEqual([]);
  });

  it("keeps the id a record already points at", () => {
    expect(visibleCategories(cats, 2).map((c) => c.id)).toEqual([1, 2]);
    expect(visibleSubcats(cats[0], 11).map((s) => s.id)).toEqual([10, 11]);
    expect(visibleSubcats(cats[1], 20).map((s) => s.id)).toEqual([20]);
  });

  it("hides a subcategory of a hidden category too", () => {
    expect(visibleSubcats(cats[1])).toEqual([]);
    expect(visibleSubcats(cats[0]).map((s) => s.id)).toEqual([10]);
  });

  it("drops groups left with nothing to offer", () => {
    expect(visibleSubcatGroups(cats).map((g) => g.category.id)).toEqual([1]);
    expect(visibleSubcatGroups(cats, 20).map((g) => g.category.id)).toEqual([1, 2]);
  });

  it("flattens and can narrow to one category", () => {
    expect(visibleSubcatsFlat(cats).map((s) => s.id)).toEqual([10]);
    expect(visibleSubcatsFlat(cats, 2)).toEqual([]);
    expect(visibleSubcatsFlat(cats, 1).map((s) => s.id)).toEqual([10]);
  });
});
