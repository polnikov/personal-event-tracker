// Geometry for the week / 3-day time grid. Pure helpers so the
// coordinate math (and the click-to-create snapping) is unit-testable
// independently of the Calendar component.

export const HOUR_HEIGHT = 56;
export const START_HOUR = 6;
export const END_HOUR = 23;
export const HOUR_COUNT = END_HOUR - START_HOUR + 1;
/** Click-to-create snaps the chosen time to this step (minutes). */
export const SNAP_MINUTES = 30;

/** Minute-of-day → pixel offset within a day column (uniform hour height).
 *  Clamped to the visible [START_HOUR, END_HOUR+1] window. */
export function minsToY(mins: number): number {
  const clamped = Math.max(START_HOUR * 60, Math.min(mins, (END_HOUR + 1) * 60));
  return ((clamped - START_HOUR * 60) / 60) * HOUR_HEIGHT;
}

/** Inverse of minsToY: pixel offset → minute-of-day, snapped to SNAP_MINUTES.
 *  Clamped so the last creatable slot is END_HOUR:SNAP. Used by click-to-create. */
export function yToMins(y: number): number {
  const mins = START_HOUR * 60 + (y / HOUR_HEIGHT) * 60;
  const snapped = Math.round(mins / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.max(START_HOUR * 60, Math.min(snapped, END_HOUR * 60 + SNAP_MINUTES));
}
