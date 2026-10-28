import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart, PieChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import ReactECharts from "echarts-for-react/lib/core";
import type { EChartsOption } from "echarts";
import { cn } from "@/lib/utils";

echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export type { EChartsOption };

// Shared chart styling tokens. All chart cards now use 14px padding,
// monospace tick/value labels, and a Y axis flush with the card title
// (achieved via `inside: true` + tiny grid.left, see `yAxisFlushLeft`).
export const ECHART_BASE_TEXT = {
  fontFamily: "Onest Variable, system-ui, sans-serif",
  color: "rgba(255, 255, 255, 0.7)",
};

export const ECHART_MONO_TEXT = {
  fontFamily: "JetBrains Mono, ui-monospace, monospace",
  fontFeatureSettings: "'tnum'",
  color: "rgba(255, 255, 255, 0.7)",
};

/** Glass theme colors for charts: hairlines, value text, the card fill used
 *  as the gap between pie slices and heatmap cells. */
export const CHART_LINE = "rgba(255, 255, 255, 0.1)";
export const CHART_INK = "#FFFFFF";
export const CHART_GAP = "#2B314D";

/** Shared tooltip: an opaque glass panel like the app's popovers. */
export const CHART_TOOLTIP = {
  backgroundColor: "rgba(42, 48, 80, 0.97)",
  borderColor: "rgba(255, 255, 255, 0.14)",
  borderWidth: 1,
  borderRadius: 14,
  textStyle: { color: "#FFFFFF", fontFamily: "Onest Variable, system-ui, sans-serif" },
  extraCssText: "box-shadow: 0 12px 32px -8px rgba(0,0,0,0.55);",
};

/** Default left grid inset for charts where Y labels sit flush with the
 *  card title (allows labels rendered `inside` the plot area). */
export const GRID_LEFT_FLUSH = 4;

/** Shade a hex color by a factor (below 1 darkens, above 1 lightens) while
 *  keeping its hue. Used to light/shadow the edges of a bar. */
export function shade(hex: string, factor: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(((n >> 16) & 255) * factor)}, ${clamp(((n >> 8) & 255) * factor)}, ${clamp((n & 255) * factor)})`;
}

/** Gradient across a bar's thickness so it reads as pressed-in (concave): a
 *  shadowed leading edge fading to the base color and a lit trailing edge.
 *  Horizontal bars shade along Y (top→bottom); vertical bars shade along X. */
export function pressedFill(hex: string, vertical = false) {
  return {
    type: "linear" as const,
    x: 0, y: 0,
    x2: vertical ? 1 : 0,
    y2: vertical ? 0 : 1,
    colorStops: [
      { offset: 0, color: shade(hex, 0.74) },
      { offset: 0.5, color: hex },
      { offset: 1, color: shade(hex, 1.1) },
    ],
  };
}

/** Green of the income bars and lines. */
export const INCOME_GREEN = "#8FE3B0";

/** Monthly bar look shared with Часы по месяцам: pressed-in gradient across
 *  the bar's width and a rounded top. */
export function monthlyBarStyle(hex: string) {
  return {
    color: pressedFill(hex, true),
    borderRadius: [12, 12, 0, 0] as [number, number, number, number],
  };
}

/** Bar total printed vertically, the way Доход по дням prints its totals:
 *  plain text (no pill) reading bottom to top. Anchored at the text's start,
 *  so the gap above the bar stays the same however long the number is. Needs
 *  about 64px of grid.top for six-digit sums. */
export function verticalBarLabel(isMobile: boolean, formatter: (p: unknown) => string) {
  return {
    show: true,
    position: "top" as const,
    rotate: 90,
    align: "left" as const,
    verticalAlign: "middle" as const,
    distance: 8,
    color: CHART_INK,
    fontFamily: "JetBrains Mono, ui-monospace, monospace",
    fontFeatureSettings: "'ss01'",
    fontSize: isMobile ? 11 : 12,
    lineHeight: isMobile ? 11 : 12,
    fontWeight: 400,
    formatter,
  };
}

/** Whole rubles with ru-RU grouping, as on the daily chart: 195 600. */
export const fmtBarTotal = (v: number) => Math.round(v).toLocaleString("ru-RU");

export function Echart({
  option,
  height = 220,
  className,
}: {
  option: EChartsOption;
  height?: number;
  className?: string;
}) {
  return (
    <ReactECharts
      echarts={echarts}
      option={option}
      notMerge
      lazyUpdate
      style={{ height, width: "100%" }}
      className={cn("echart-root", className)}
      opts={{ renderer: "canvas" }}
    />
  );
}
