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

    series.slices.template.adapters.add("fill", (_, target) => {
      const category = target.dataItem?.get("category", "");
      const match = data.find((d) => d.label === category);
      return match ? am5.color(match.color) : _;
    });

    series.slices.template.states.create("hover", {
      scale: 1.08,
      strokeWidth: 4,
    });

    series.slices.template.states.create("active", {
      shiftRadius: 8,
      strokeWidth: 4,
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

    series.data.setAll(
      data.map((item) => ({
        value: item.count,
        category: item.label,
      })),
    );

    // Click slice -> isolate (dim others). One handler per slice instance.
    let activeSlice: am5percent.PieSeriesSlice | null = null;
    series.slices.each((slice) => {
      slice.on("click", () => {
        const sliceDataItem = slice.dataItem;
        if (!sliceDataItem) return;
        if (activeSlice === slice) {
          // Toggle off
          activeSlice = null;
          series.slices.each((s) => s.states.applyAll());
          series.slices.each((s) => s.set("active", false));
          return;
        }
        if (activeSlice) {
          activeSlice.set("active", false);
        }
        activeSlice = slice;
        series.slices.each((s) => {
          if (s === slice) {
            s.set("active", true);
            s.states.applyAll();
          } else {
            s.set("state", "dimmed");
          }
        });
      });
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

    // Legend item click -> toggle slice visibility
    legend.itemContainers.each((item) => {
      item.set("cursorOverStyle", "pointer");
      item.events.on("click", () => {
        const dataItem = item.dataItem as am5.DataItem<am5percent.ISliceSeriesDataItem> | undefined;
        if (!dataItem) return;
        const category = dataItem.dataContext?.category as string | undefined;
        if (!category) return;
        const slice = dataItem.get("slice") as am5percent.PieSeriesSlice | undefined;
        if (!slice) return;
        if (slice.get("hidden")) {
          slice.show();
        } else {
          slice.hide();
        }
      });
    });

    legend.data.setAll(series.dataItems);

    series.appear(800, 100);

    return () => {
      root.dispose();
    };
  }, [data]);

  return <div ref={chartRef} style={{ width: "100%", height: "260px" }} />;
}