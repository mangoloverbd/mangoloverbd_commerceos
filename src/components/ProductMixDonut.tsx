import * as am5 from "@amcharts/amcharts5";
import * as am5percent from "@amcharts/amcharts5/percent";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import { useEffect, useRef } from "react";

interface StatusItem {
  label: string;
  count: number;
  color: string;
}

export function ProductMixDonut({ data }: { data: StatusItem[] }) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    const root = am5.Root.new(chartRef.current);

    root.setThemes([am5themes_Animated.new(root)]);

    const chart = root.container.children.push(
      am5percent.PieChart.new(root, {
        layout: root.verticalLayout,
      }),
    );

    const series = chart.series.push(
      am5percent.PieSeries.new(root, {
        alignLabels: true,
        calculateAggregates: true,
        valueField: "value",
        categoryField: "category",
      }),
    );

    series.slices.template.setAll({
      strokeWidth: 2,
      stroke: am5.color(0xfafaf8),
      tooltipText: "{category}: {value} ({valuePercentTotal.formatNumber('0.0')}%)",
    });

    series.labelsContainer.set("paddingTop", 20);

    series.slices.template.adapters.add("radius", (radius, target) => {
      const dataItem = target.dataItem;
      const high = series.getPrivate("valueHigh");
      if (dataItem) {
        const value = target.dataItem?.get("valueWorking", 0) ?? 0;
        return (radius * value) / high;
      }
      return radius;
    });

    series.data.setAll(
      data.map((item) => ({
        value: item.count,
        category: item.label,
      })),
    );

    series.slices.template.adapters.add("fill", (_, target) => {
      const category = target.dataItem?.get("category", "");
      const match = data.find((d) => d.label === category);
      return match ? am5.color(match.color) : _;
    });

    const legend = chart.children.push(
      am5.Legend.new(root, {
        centerX: am5.p50,
        x: am5.p50,
        marginTop: 12,
        marginBottom: 0,
      }),
    );

    legend.labels.template.setAll({
      fontSize: 11,
      fill: am5.color(0x555555),
    });

    legend.valueLabels.template.setAll({
      fontSize: 11,
      fontWeight: "600",
      fill: am5.color(0x171717),
    });

    legend.data.setAll(series.dataItems);

    series.appear(1000, 100);

    return () => {
      root.dispose();
    };
  }, [data]);

  return <div ref={chartRef} style={{ width: "100%", height: "260px" }} />;
}
