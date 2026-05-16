import * as echarts from "echarts/core";
import { BarChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import ReactECharts from "echarts-for-react/lib/core";
import type { EChartsOption } from "echarts";

echarts.use([
  BarChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export type { EChartsOption };

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
