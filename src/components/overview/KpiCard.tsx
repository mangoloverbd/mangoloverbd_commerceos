import { useId } from "react";
import { motion } from "framer-motion";
import {
  Package,
  CurrencyCircleDollar,
  Percent,
  Truck,
  Chats,
  Warning,
  Cube,
} from "@phosphor-icons/react";
import { StepSparkline } from "@/components/charts/StepSparkline";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ElementType> = {
  Package,
  CurrencyCircleDollar,
  Percent,
  Truck,
  Chats,
  Warning,
  Cube,
};

// Soft streak along the card's top edge, faded in on hover.
function CardGlow() {
  const id = useId();
  return (
    <svg
      aria-hidden
      viewBox="0 0 519 181"
      fill="none"
      className="pointer-events-none absolute top-[-84px] left-1/2 h-[181px] w-[519px] max-w-none -translate-x-1/2 -scale-y-100 opacity-0 transition-opacity duration-600 ease-[cubic-bezier(0.215,0.61,0.355,1)] group-hover/stat:opacity-60"
    >
      <defs>
        <filter id={`${id}-b15`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="15" />
        </filter>
        <filter id={`${id}-b6`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <linearGradient id={`${id}-line`} x1="59" y1="0" x2="459" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#121212" stopOpacity="0" />
          <stop offset="0.5" stopColor="#121212" />
          <stop offset="1" stopColor="#121212" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="259.5" cy="102" rx="200.5" ry="13" fill="#121212" opacity="0.12" filter={`url(#${id}-b15)`} />
      <ellipse cx="259" cy="86" rx="157" ry="29" fill="#121212" opacity="0.05" filter={`url(#${id}-b15)`} />
      <ellipse cx="259" cy="97" rx="157" ry="18" fill="#121212" opacity="0.05" filter={`url(#${id}-b6)`} />
      <ellipse cx="259.5" cy="90.5" rx="229.5" ry="60.5" fill="#121212" opacity="0.02" filter={`url(#${id}-b15)`} />
      <line x1="59" y1="96.5" x2="459" y2="96.5" stroke={`url(#${id}-line)`} />
      <line x1="59" y1="94.5" x2="459" y2="94.5" stroke={`url(#${id}-line)`} strokeWidth="5" opacity="0.5" filter={`url(#${id}-b6)`} />
    </svg>
  );
}

export function KpiCard({
  label,
  value,
  trend,
  previousValue,
  sparklineValues,
  sparklineLabels,
  formatSparkline,
  icon,
}: {
  label: string;
  value: string;
  trend?: number;
  previousValue?: number;
  sparklineValues?: number[];
  sparklineLabels?: string[];
  formatSparkline?: (value: number) => string;
  icon: string;
}) {
  const IconComponent = iconMap[icon] || Package;
  const hasSparkline = Array.isArray(sparklineValues) && sparklineValues.length > 0;
  const hasTrend = typeof trend === "number";
  const isPositive = (trend ?? 0) >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="group/stat relative flex min-w-0 flex-col rounded-[16px] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04),0_0_0_1px_rgb(0_0_0/0.06)] transition-shadow duration-150 hover:shadow-[0_2px_4px_rgb(0_0_0/0.04),0_4px_12px_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.08)]"
    >
      <div className="pointer-events-none absolute inset-0 overflow-clip rounded-[inherit]">
        <CardGlow />
      </div>
      <div className="relative flex flex-1 flex-col justify-between gap-2 px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="relative flex size-6 shrink-0 items-center justify-center rounded-[7px] border border-black/[0.08] bg-linear-to-b from-white to-[#f4f4f5] shadow-[0_2px_4px_rgb(0_0_0/0.04),0_1px_2px_rgb(0_0_0/0.06),inset_0_1px_0_rgb(255_255_255/1)] [&>svg]:[filter:drop-shadow(0_1px_1px_rgb(0_0_0/0.12))]"
          >
            <IconComponent weight="light" size={14} className="text-[#121212]" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] leading-5 font-[550] text-black/50 transition-colors duration-400 ease-[cubic-bezier(0.645,0.045,0.355,1)] group-hover/stat:text-[#121212]">
            {label}
          </span>
          {hasTrend && (
            <span
              title="vs previous period"
              className={cn(
                "flex h-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] leading-4 font-semibold tabular-nums",
                isPositive ? "bg-[#1fc16b]/12 text-[#16a35a]" : "bg-[#f05959]/12 text-[#e5484d]"
              )}
            >
              {isPositive ? "+" : ""}
              {(trend ?? 0).toFixed(1)}%
            </span>
          )}
        </div>

        <div className="flex items-end justify-between gap-3">
          <span className="text-[22px] leading-7 font-medium tracking-[-0.03em] whitespace-nowrap text-[#121212] tabular-nums">
            {value}
          </span>
          {hasSparkline && (
            <span className="shrink-0">
              <StepSparkline values={sparklineValues} seed={label} labels={sparklineLabels} format={formatSparkline} />
            </span>
          )}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_0_rgb(255_255_255/1)]" />
    </motion.div>
  );
}
