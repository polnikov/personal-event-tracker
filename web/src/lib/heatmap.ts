import type { EChartsOption } from "echarts";

export const MONTH_ABBR = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
];

const DOW_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const AXIS_TEXT = {
  fontFamily: "Inter, system-ui, sans-serif",
  color: "#807A72",
};

/**
 * Build the ECharts option for the weekday × month heatmap.
 *
 * `matrix` is [weekday 0..6 (Mon..Sun)][month 0..11]. ECharts data points are
 * [x, y, value]; the Y axis is inverted, so the lead axis is reversed to keep
 * reading order:
 *   Desktop — X = months, Y = weekdays (Mon top → Sun bottom)
 *   Mobile  — X = weekdays, Y = months (Jan top → Dec bottom)
 *
 * Returns null when the matrix is missing or not 7 rows.
 */
export function weekdayMonthHeatmap(
  matrix: number[][] | null | undefined,
  isMobile: boolean,
  groupThousands = false,
): EChartsOption | null {
  if (!matrix || matrix.length !== 7) return null;
  const cells: [number, number, number][] = [];
  let maxValue = 0;
  for (let w = 0; w < 7; w++) {
    for (let m = 0; m < 12; m++) {
      const c = matrix[w][m] || 0;
      const x = isMobile ? w : m;
      const y = isMobile ? 11 - m : 6 - w;
      cells.push([x, y, c]);
      if (c > maxValue) maxValue = c;
    }
  }
  const xData = isMobile ? DOW_LABELS : MONTH_ABBR;
  const yData = isMobile ? [...MONTH_ABBR].reverse() : [...DOW_LABELS].reverse();
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
