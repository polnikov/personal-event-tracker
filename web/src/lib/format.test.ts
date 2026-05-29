import { describe, expect, it } from "vitest";

import {
  fmt,
  initials,
  pluralize,
  stringToColor,
  toDatetimeLocalValue,
} from "./format";

describe("fmt.money", () => {
  it("returns dash for empty values", () => {
    expect(fmt.money(null)).toBe("—");
    expect(fmt.money(undefined)).toBe("—");
    expect(fmt.money("")).toBe("—");
  });

  it("formats numbers with ru grouping and no decimals", () => {
    // ru-RU groups with a non-breaking space ( ).
    expect(fmt.money(1234567)).toBe("1 234 567");
    expect(fmt.money(1500.7)).toBe("1 501");
  });

  it("parses numeric strings", () => {
    expect(fmt.money("250")).toBe("250");
  });

  it("echoes back non-numeric strings", () => {
    expect(fmt.money("n/a")).toBe("n/a");
  });
});

describe("fmt.duration", () => {
  it("shows minutes under an hour", () => {
    expect(fmt.duration(45)).toBe("45 мин");
    expect(fmt.duration(0)).toBe("0 мин");
  });

  it("shows whole hours", () => {
    expect(fmt.duration(120)).toBe("2 ч");
  });

  it("shows hours and minutes", () => {
    expect(fmt.duration(90)).toBe("1 ч 30 мин");
    expect(fmt.duration(155)).toBe("2 ч 35 мин");
  });
});

describe("fmt.time", () => {
  it("renders HH:mm from a naive ISO string (timezone-independent)", () => {
    expect(fmt.time("2026-06-15T10:05:00")).toBe("10:05");
    expect(fmt.time("2026-06-15T23:00:00")).toBe("23:00");
  });

  it("returns empty string for falsy input", () => {
    expect(fmt.time(null)).toBe("");
    expect(fmt.time(undefined)).toBe("");
  });
});

describe("toDatetimeLocalValue", () => {
  it("formats an ISO string into a datetime-local value", () => {
    expect(toDatetimeLocalValue("2026-06-15T10:05:00")).toBe("2026-06-15T10:05");
  });
});

describe("pluralize (Russian rules)", () => {
  const word = (n: number) => pluralize(n, "событие", "события", "событий");

  it("uses the 'one' form for 1, 21, 31...", () => {
    expect(word(1)).toBe("событие");
    expect(word(21)).toBe("событие");
  });

  it("uses the 'few' form for 2-4, 22-24...", () => {
    expect(word(2)).toBe("события");
    expect(word(3)).toBe("события");
    expect(word(22)).toBe("события");
  });

  it("uses the 'many' form for 0, 5-20, 11-14...", () => {
    expect(word(0)).toBe("событий");
    expect(word(5)).toBe("событий");
    expect(word(11)).toBe("событий");
    expect(word(12)).toBe("событий");
    expect(word(14)).toBe("событий");
  });
});

describe("initials", () => {
  it("takes first letters of up to two words, uppercased", () => {
    expect(initials("Иван Петров")).toBe("ИП");
    expect(initials("анна")).toBe("А");
    expect(initials("  Мария  Иванова  ")).toBe("МИ");
  });

  it("caps at two letters for longer names", () => {
    expect(initials("Анна Мария Петровна")).toBe("АМ");
  });
});

describe("stringToColor", () => {
  it("is deterministic for the same input", () => {
    expect(stringToColor("Иван")).toBe(stringToColor("Иван"));
  });

  it("always returns a value from the palette", () => {
    const palette = ["#E8E2D5", "#DDE5D5", "#D8E0E5", "#E5D8DC", "#E0D5E5", "#E5DDD5", "#D5E5E0"];
    for (const s of ["a", "bb", "ccc", "тест", "x y z"]) {
      expect(palette).toContain(stringToColor(s));
    }
  });
});
