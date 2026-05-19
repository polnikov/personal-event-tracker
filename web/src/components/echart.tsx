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
      className={className}
      opts={{ renderer: "canvas" }}
    />
  );
}
