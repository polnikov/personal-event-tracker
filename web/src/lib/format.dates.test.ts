import { describe, expect, it } from "vitest";

import { fmt } from "./format";

// Date/time formatters wrap date-fns with the ru locale. Naive ISO strings
// (no offset) are parsed as local wall-clock, so these assertions are
// timezone-independent. Day numbers / times are asserted exactly; locale
// month/weekday tokens are matched loosely to stay robust across date-fns
// patch releases.

const D = "2026-06-15T10:05:00"; // a Monday

describe("fmt.date", () => {
  it("renders day + short month", () => {
    expect(fmt.date(D)).toMatch(/^15\s+\S+/);
  });
  it("returns empty for falsy input", () => {
    expect(fmt.date(null)).toBe("");
    expect(fmt.date(undefined)).toBe("");
  });
});

describe("fmt.dateTime", () => {
  it("includes the day and the HH:mm time", () => {
    const out = fmt.dateTime(D);
    expect(out).toContain("15");
    expect(out).toContain("10:05");
  });
});

describe("fmt.weekday", () => {
  it("returns a short ru weekday token", () => {
    expect(fmt.weekday(D)).toMatch(/^[а-я]{2}$/i);
  });
});

describe("fmt.fullDate", () => {
  it("renders day + full month (genitive) + year", () => {
    expect(fmt.fullDate(D)).toBe("15 июня 2026");
  });
});

describe("fmt.monthYear", () => {
  it("renders standalone month + year", () => {
    expect(fmt.monthYear(new Date(2026, 5, 1))).toBe("июнь 2026");
  });
});

describe("fmt.monthShort", () => {
  it("renders an abbreviated ru month", () => {
    expect(fmt.monthShort(D)).toMatch(/июн/i);
  });
});

describe("fmt.todayHeader", () => {
  it("includes the full date in the header", () => {
    expect(fmt.todayHeader(new Date(2026, 5, 15))).toContain("15 июня");
  });
});

describe("fmt.date accepts Date objects", () => {
  it("formats a Date the same as its ISO string", () => {
    const d = new Date(2026, 5, 15, 10, 5);
    expect(fmt.date(d)).toBe(fmt.date(D));
  });
});
