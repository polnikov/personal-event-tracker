import type { Category, Subcategory } from "@/types/api";

/**
 * Hiding a category or subcategory only takes it out of the pickers and
 * filters — it never rewrites history. The API keeps returning hidden entries
 * so existing events still render their name, colour and icon; these helpers
 * are what the pickers use to narrow that payload down.
 *
 * Every helper takes an optional `keepId`: the value a record already points
 * at survives the filter, so opening an old event (or package) whose category
 * was hidden afterwards doesn't silently drop the selection on save.
 */

/** Subcategories of one category that a picker may offer. A hidden category
 *  takes its subcategories with it. */
export function visibleSubcats(cat: Category, keepId?: number | null): Subcategory[] {
  return cat.subcategories.filter(
    (s) => s.id === keepId || (!cat.hidden && !s.hidden),
  );
}

/** Categories a picker may offer. */
export function visibleCategories(
  cats: Category[] | undefined,
  keepId?: number | null,
): Category[] {
  return (cats ?? []).filter((c) => !c.hidden || c.id === keepId);
}

/** Categories paired with their offerable subcategories, for grouped pickers.
 *  A category with nothing left to offer is dropped entirely. */
export function visibleSubcatGroups(
  cats: Category[] | undefined,
  keepSubcatId?: number | null,
): { category: Category; subcategories: Subcategory[] }[] {
  const out: { category: Category; subcategories: Subcategory[] }[] = [];
  for (const c of cats ?? []) {
    const subs = visibleSubcats(c, keepSubcatId);
    if (subs.length > 0) out.push({ category: c, subcategories: subs });
  }
  return out;
}

/** Flat list of offerable subcategories, optionally limited to one category.
 *  Used by the filter dropdowns, which show subcategory names on their own. */
export function visibleSubcatsFlat(
  cats: Category[] | undefined,
  categoryId?: number | null,
): Subcategory[] {
  return visibleSubcatGroups(cats)
    .filter((g) => !categoryId || g.category.id === categoryId)
    .flatMap((g) => g.subcategories);
}
