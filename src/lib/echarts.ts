import * as echarts from "echarts/core";
import { BarChart, GaugeChart, LineChart, PictorialBarChart, PieChart, SankeyChart } from "echarts/charts";
import { GraphicComponent, GridComponent, MarkPointComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  GaugeChart,
  LineChart,
  PictorialBarChart,
  PieChart,
  SankeyChart,
  GraphicComponent,
  GridComponent,
  MarkPointComponent,
  TooltipComponent,
  SVGRenderer,
]);

export { echarts };
export type { EChartsCoreOption } from "echarts/core";
