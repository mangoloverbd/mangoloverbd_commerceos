import { useEffect, useRef } from "react";
import { echarts, type EChartsCoreOption } from "@/lib/echarts";

type EChartProps = {
  option: EChartsCoreOption;
  ariaLabel: string;
  className?: string;
  animate?: boolean;
};

export function EChart({ option, ariaLabel, className, animate = true }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = echarts.init(container, null, { renderer: "svg" });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption({ animation: animate, textStyle: { fontFamily: '"Geist Sans", system-ui, sans-serif' }, ...option }, true);
  }, [option, animate]);

  return <div ref={containerRef} role="img" aria-label={ariaLabel} className={className} />;
}
