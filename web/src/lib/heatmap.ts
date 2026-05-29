import type { EChartsOption } from "echarts";

export const MONTH_ABBR = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
];

const DOW_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));

const AXIS_TEXT = {
  fontFamily: "Inter, system-ui, sans-serif",
  color: "#807A72",
};

/**
 * Build an ECharts heatmap option from a [rows][cols] count matrix.
 *
 * Data points are [x, y, value]; the Y axis is inverted, so the lead axis is
 * reversed to keep natural reading order:
 *   Desktop — X = cols, Y = rows  (first row on top)
 *   Mobile  — X = rows, Y = cols  (first col on top)
 *
 * Returns null when the matrix is missing or its row count != rowLabels.
 */
function buildHeatmap(
  matrix: number[][] | null | undefined,
  rowLabels: string[],
  colLabels: string[],
  isMobile: boolean,
  groupThousands = false,
): EChartsOption | null {
  const rows = rowLabels.length;
  const cols = colLabels.length;
  if (!matrix || matrix.length !== rows) return null;
  const cells: [number, number, number][] = [];
  let maxValue = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = matrix[r][c] || 0;
      const x = isMobile ? r : c;
      const y = isMobile ? cols - 1 - c : rows - 1 - r;
      cells.push([x, y, v]);
      if (v > maxValue) maxValue = v;
    }
  }
  const xData = isMobile ? rowLabels : colLabels;
  const yData = isMobile ? [...colLabels].reverse() : [...rowLabels].reverse();
  return {
    grid: { top: 16, right: 16, bottom: 28, left: 36 },
    tooltip: { show: false },
    visualMap: {
      show: false,
      type: "continuous",
      min: 0,
      max: Math.max(maxValue, 1),
      calculable: false,
      inRange: {
        color: ["rgba(123, 182, 97, 0.04)", "rgb(123, 182, 97)"],
      },
    },
    xAxis: {
      type: "category",
      data: xData,
      splitArea: { show: false },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#ECEAE3" } },
      axisLabel: { ...AXIS_TEXT, fontSize: 11 },
    },
    yAxis: {
      type: "category",
      data: yData,
      splitArea: { show: false },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#ECEAE3" } },
      axisLabel: { ...AXIS_TEXT, fontSize: 11 },
    },
    series: [
      {
        type: "heatmap" as const,
        data: cells,
        label: {
          show: true,
          color: "#2A2A2E",
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          fontFeatureSettings: "'tnum'",
          fontSize: 11,
          formatter: (p: unknown) => {
            const v = (p as { value: [number, number, number] }).value[2];
            if (v <= 0) return "";
            return groupThousands
              ? v.toLocaleString("ru-RU", { maximumFractionDigits: 0 })
              : String(v);
          },
        },
        itemStyle: {
          borderColor: "#FFFFFF",
          borderWidth: 2,
          borderRadius: 4,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 8,
            shadowColor: "rgba(42, 42, 46, 0.15)",
          },
        },
      },
    ],
  } as EChartsOption;
}

/** Weekday × month heatmap. matrix is [weekday 0..6 (Mon..Sun)][month 0..11].
 *  Desktop: X = months, Y = weekdays; Mobile: X = weekdays, Y = months. */
export function weekdayMonthHeatmap(
  matrix: number[][] | null | undefined,
  isMobile: boolean,
  groupThousands = false,
): EChartsOption | null {
  return buildHeatmap(matrix, DOW_LABELS, MONTH_ABBR, isMobile, groupThousands);
}

/** Weekday × hour heatmap. matrix is [weekday 0..6 (Mon..Sun)][hour 0..23].
 *  Desktop: X = hours, Y = weekdays; Mobile: X = weekdays, Y = hours. */
export function weekdayHourHeatmap(
  matrix: number[][] | null | undefined,
  isMobile: boolean,
): EChartsOption | null {
  return buildHeatmap(matrix, DOW_LABELS, HOUR_LABELS, isMobile);
}
