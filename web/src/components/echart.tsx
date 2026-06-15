import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
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
  GridComponent,
  LegendComponent,
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
  fontFamily: "Inter, system-ui, sans-serif",
  color: "#807A72",
};

export const ECHART_MONO_TEXT = {
  fontFamily: "JetBrains Mono, ui-monospace, monospace",
  fontFeatureSettings: "'tnum'",
  color: "#807A72",
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

/** Vertical bar fill anchored at the zero baseline: a pale base at value 0
 *  that grows more saturated with the value (vs the period max), so the
 *  gradient reads as one field rising from 0. */
export function incomeBarFill(value: number, max: number, hex = "#7BB661") {
  const f = max > 0 ? value / max : 0;
  return {
    type: "linear" as const,
    x: 0, y: 1, x2: 0, y2: 0, // start at the bar base (value 0)
    colorStops: [
      { offset: 0, color: shade(hex, 1.32) }, // base @ 0 — pale
      { offset: 1, color: shade(hex, 1.32 - 0.4 * f) }, // top — saturated by value
    ],
  };
}

/** Data-label box styled to read as gently pressed into the card: a recessed
 *  off-white fill with a darker rim and no raising drop shadow. Spread into a
 *  chart label alongside its own position/font/formatter. */
export const PRESSED_LABEL_BOX = {
  backgroundColor: "#F1EFE9",
  borderColor: "#E2DFD6",
  borderWidth: 1,
  borderRadius: 6,
  padding: [4, 6, 4, 6] as [number, number, number, number],
  shadowColor: "rgba(42, 42, 46, 0.06)",
  shadowBlur: 2,
  shadowOffsetY: 0,
};

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
