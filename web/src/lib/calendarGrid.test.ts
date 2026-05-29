import { describe, expect, it } from "vitest";

import {
  END_HOUR,
  HOUR_COUNT,
  HOUR_HEIGHT,
  SNAP_MINUTES,
  START_HOUR,
  minsToY,
  yToMins,
} from "./calendarGrid";

const yForMins = (mins: number) => ((mins - START_HOUR * 60) / 60) * HOUR_HEIGHT;

describe("minsToY", () => {
  it("maps the start hour to 0 and each hour to HOUR_HEIGHT", () => {
    expect(minsToY(START_HOUR * 60)).toBe(0);
    expect(minsToY((START_HOUR + 1) * 60)).toBe(HOUR_HEIGHT);
  });

  it("maps a half hour to half the row height", () => {
    expect(minsToY(START_HOUR * 60 + 30)).toBe(HOUR_HEIGHT / 2);
  });

  it("clamps below the window to 0", () => {
    expect(minsToY(0)).toBe(0);
    expect(minsToY(START_HOUR * 60 - 120)).toBe(0);
  });

  it("clamps above the window to the full grid height", () => {
    const fullHeight = HOUR_HEIGHT * HOUR_COUNT;
    expect(minsToY(99999)).toBe(fullHeight);
    expect(minsToY((END_HOUR + 1) * 60)).toBe(fullHeight);
  });
});

describe("yToMins", () => {
  it("maps 0 to the start hour and HOUR_HEIGHT to the next hour", () => {
    expect(yToMins(0)).toBe(START_HOUR * 60);
    expect(yToMins(HOUR_HEIGHT)).toBe((START_HOUR + 1) * 60);
  });

  it("snaps to 30-minute steps", () => {
    expect(SNAP_MINUTES).toBe(30);
    // 6:10 → rounds down to 6:00
    expect(yToMins(yForMins(START_HOUR * 60 + 10))).toBe(START_HOUR * 60);
    // 6:20 → rounds up to 6:30
    expect(yToMins(yForMins(START_HOUR * 60 + 20))).toBe(START_HOUR * 60 + 30);
    // exact half hour stays
    expect(yToMins(yForMins(START_HOUR * 60 + 30))).toBe(START_HOUR * 60 + 30);
  });

  it("clamps negative offsets to the start hour", () => {
    expect(yToMins(-50)).toBe(START_HOUR * 60);
  });

  it("clamps past the end to END_HOUR:30 (last creatable slot)", () => {
    expect(yToMins(100000)).toBe(END_HOUR * 60 + SNAP_MINUTES);
  });
});

describe("round trip", () => {
  it("minsToY ∘ yToMins is stable on snapped boundaries", () => {
    for (const mins of [START_HOUR * 60, START_HOUR * 60 + 30, 12 * 60, END_HOUR * 60]) {
      expect(yToMins(minsToY(mins))).toBe(mins);
    }
  });
});
