import { describe, expect, it } from "vitest";

import { MONTH_ABBR, weekdayHourHeatmap, weekdayMonthHeatmap } from "./heatmap";

const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** 7×12 zero matrix with optional [w, m] = value overrides. */
function matrix(overrides: [number, number, number][] = []): number[][] {
  const m = Array.from({ length: 7 }, () => Array.from({ length: 12 }, () => 0));
  for (const [w, mo, v] of overrides) m[w][mo] = v;
  return m;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cellsOf = (opt: any): [number, number, number][] => opt.series[0].data;
const findCell = (cells: [number, number, number][], x: number, y: number) =>
  cells.find((c) => c[0] === x && c[1] === y);

describe("weekdayMonthHeatmap guards", () => {
  it("returns null without a matrix", () => {
    expect(weekdayMonthHeatmap(null, false)).toBeNull();
    expect(weekdayMonthHeatmap(undefined, false)).toBeNull();
  });

  it("returns null when the matrix is not 7 rows", () => {
    expect(weekdayMonthHeatmap([[0], [0]], false)).toBeNull();
  });
});

describe("weekdayMonthHeatmap desktop layout (X=months, Y=weekdays)", () => {
  const opt = weekdayMonthHeatmap(
    matrix([
      [0, 0, 5], // Mon, Jan
      [6, 11, 42], // Sun, Dec
      [2, 3, 7], // Wed, Apr
    ]),
    false,
  )!;

  it("produces 84 cells", () => {
    expect(cellsOf(opt)).toHaveLength(84);
  });

  it("maps weekday→y (6-w) and month→x", () => {
    const cells = cellsOf(opt);
    expect(findCell(cells, 0, 6)![2]).toBe(5); // w0,m0
    expect(findCell(cells, 11, 0)![2]).toBe(42); // w6,m11
    expect(findCell(cells, 3, 4)![2]).toBe(7); // w2,m3 -> y=6-2=4
  });

  it("labels months on X and reversed weekdays on Y", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = opt as any;
    expect(o.xAxis.data).toEqual(MONTH_ABBR);
    expect(o.yAxis.data).toEqual([...DOW].reverse());
  });

  it("scales visualMap.max to the largest value", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((opt as any).visualMap.max).toBe(42);
  });
});

describe("weekdayMonthHeatmap mobile layout (X=weekdays, Y=months)", () => {
  const opt = weekdayMonthHeatmap(
    matrix([
      [0, 0, 5], // Mon, Jan
      [6, 11, 42], // Sun, Dec
    ]),
    true,
  )!;

  it("maps weekday→x and month→y (11-m)", () => {
    const cells = cellsOf(opt);
    expect(findCell(cells, 0, 11)![2]).toBe(5); // w0,m0
    expect(findCell(cells, 6, 0)![2]).toBe(42); // w6,m11
  });

  it("labels weekdays on X and reversed months on Y", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = opt as any;
    expect(o.xAxis.data).toEqual(DOW);
    expect(o.yAxis.data).toEqual([...MONTH_ABBR].reverse());
  });
});

describe("weekdayMonthHeatmap empty matrix", () => {
  it("keeps visualMap.max at least 1", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opt = weekdayMonthHeatmap(matrix(), false) as any;
    expect(opt.visualMap.max).toBe(1);
  });
});

function hourMatrix(overrides: [number, number, number][] = []): number[][] {
  const m = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const [w, h, v] of overrides) m[w][h] = v;
  return m;
}

describe("weekdayHourHeatmap", () => {
  it("returns null unless the matrix has 7 rows", () => {
    expect(weekdayHourHeatmap(null, false)).toBeNull();
    expect(weekdayHourHeatmap([[0]], false)).toBeNull();
  });

  it("produces 168 cells (7×24)", () => {
    expect(cellsOf(weekdayHourHeatmap(hourMatrix(), false))).toHaveLength(168);
  });

  it("desktop: X = hours, Y = weekdays (6-w)", () => {
    const opt = weekdayHourHeatmap(hourMatrix([[0, 9, 5], [6, 23, 3]]), false)!;
    const cells = cellsOf(opt);
    expect(findCell(cells, 9, 6)![2]).toBe(5); // Mon 09:00
    expect(findCell(cells, 23, 0)![2]).toBe(3); // Sun 23:00
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = opt as any;
    expect(o.xAxis.data).toHaveLength(24);
    expect(o.xAxis.data[0]).toBe("00");
    expect(o.xAxis.data[23]).toBe("23");
    expect(o.yAxis.data).toEqual([...DOW].reverse());
  });

  it("mobile: X = weekdays, Y = hours (23-h)", () => {
    const opt = weekdayHourHeatmap(hourMatrix([[0, 9, 5]]), true)!;
    expect(findCell(cellsOf(opt), 0, 14)![2]).toBe(5); // w0, hour9 -> y=23-9
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = opt as any;
    expect(o.xAxis.data).toEqual(DOW);
    expect(o.yAxis.data).toHaveLength(24);
  });
});

describe("weekdayMonthHeatmap label formatter", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatter = (groupThousands: boolean) =>
    (weekdayMonthHeatmap(matrix(), false, groupThousands) as any).series[0].label.formatter;

  it("hides zero/negative values", () => {
    expect(formatter(false)({ value: [0, 0, 0] })).toBe("");
    expect(formatter(false)({ value: [0, 0, -3] })).toBe("");
  });

  it("renders plain integers by default", () => {
    expect(formatter(false)({ value: [0, 0, 7] })).toBe("7");
  });

  it("groups thousands when asked", () => {
    // ru-RU uses a non-breaking group separator; derive the expected string
    // from the same locale machinery rather than hardcoding the space char.
    const expected = (1500).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
    expect(formatter(true)({ value: [0, 0, 1500] })).toBe(expected);
    expect(formatter(false)({ value: [0, 0, 1500] })).toBe("1500");
  });
});
