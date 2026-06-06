import type { Category } from "@/types/api";

/**
 * Pure helpers for EventForm's "selecting a subcategory auto-fills the club
 * from its category's default" rule. Extracted so the branching is unit-
 * testable without rendering the whole form.
 */

/** The category that owns a given subcategory, or undefined if none matches. */
export function findCategoryForSubcat(
  categories: Category[] | undefined,
  subcategoryId: number,
): Category | undefined {
  return (categories ?? []).find((c) =>
    c.subcategories.some((s) => s.id === subcategoryId),
  );
}

/**
 * The `club_id` form value to apply for a category: its default club id as a
 * string, or "" when the category is missing or has no default club (so the
 * field is cleared rather than left stale).
 */
export function defaultClubValue(category: Category | undefined): string {
  if (!category || category.default_club_id == null) return "";
  return String(category.default_club_id);
}
