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
        innerRadius: am5.percent(60),
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
      cursorOverStyle: "pointer",
    });

    series.slices.template.adapters.add("fill", (_, target) => {
      const category = target.dataItem?.get("category", "");
      const match = data.find((d) => d.label === category);
      return match ? am5.color(match.color) : _;
    });

    series.labelsContainer.set("paddingTop", 20);

    // Variable slice radius by value
    series.slices.template.adapters.add("radius", (radius, target) => {
      const dataItem = target.dataItem;
      const high = series.getPrivate("valueHigh");
      if (dataItem) {
        const value = target.dataItem?.get("valueWorking", 0) ?? 0;
        return (radius * value) / high;
      }
      return radius;
    });

    // Hover: pop out + grow slice
    series.slices.template.states.create("hover", {
      scale: 1.08,
      strokeWidth: 4,
    });

    series.slices.template.states.create("active", {
      shiftRadius: 8,
    });

    series.slices.template.states.create("dimmed", {
      opacity: 0.25,
    });

    series.labels.template.setAll({
      fontSize: 11,
      fill: am5.color(0x171717),
      fontWeight: "500",
    });

    series.ticks.template.setAll({
      stroke: am5.color(0x171717),
      strokeWidth: 1,
    });

    // Click slice -> isolate (dim others)
    let activeSlice: am5.DataItem<am5percent.ISliceSeriesDataItem> | null = null;
    series.slices.template.on("active", function (active, target) {
      if (target.dataItem) {
        if (active) {
          if (activeSlice && activeSlice !== target.dataItem) {
            activeSlice.set("active", false);
          }
          activeSlice = target.dataItem;
          series.slices.each((slice) => {
            if (slice.dataItem !== target.dataItem) {
              slice.set("state", "dimmed");
            } else {
              slice.set("state", "active");
            }
          });
        } else {
          activeSlice = null;
          series.slices.each((slice) => {
            slice.set("state", "hover");
          });
          series.slices.template.set("state", "default");
        }
      }
    });

    series.data.setAll(
      data.map((item) => ({
        value: item.count,
        category: item.label,
      })),
    );

    const legend = chart.children.push(
      am5.Legend.new(root, {
        centerX: am5.p50,
        x: am5.p50,
        marginTop: 12,
        marginBottom: 0,
        clickTargetType: "none",
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

    legend.markerContainers.template.setAll({
      cursorOverStyle: "pointer",
    });

    legend.itemContainers.template.set("cursorOverStyle", "pointer");

    // Click legend item -> toggle visibility
    let hidden: Set<string> = new Set();
    legend.itemContainers.template.on("click", (e, target) => {
      if (!target.dataItem) return;
      const dataContext = target.dataItem.dataContext as { category?: string };
      const category = dataContext?.category;
      if (!category) return;
      const slice = series.slices.getIndex(series.dataItems.indexOf(target.dataItem as am5.DataItem<am5percent.ISliceSeriesDataItem>));
      if (!slice) return;

      if (hidden.has(category)) {
        hidden.delete(category);
        slice.show();
      } else {
        hidden.add(category);
        slice.hide();
      }
    });

    legend.data.setAll(series.dataItems);

    // Animate slices on initial render
    series.appear(800, 100);

    return () => {
      root.dispose();
    };
  }, [data]);

  return <div ref={chartRef} style={{ width: "100%", height: "260px" }} />;
}