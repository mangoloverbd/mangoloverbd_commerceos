import { motion } from "framer-motion";
import {
  Package,
  CurrencyCircleDollar,
  Percent,
  Truck,
  Chats,
  Warning,
  Cube,
  TrendUp,
  TrendDown,
} from "@phosphor-icons/react";
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

function MiniSparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[3px]" style={{ height: "24px" }}>
      {values.map((v, i) => {
        const isActive = i === values.length - 1;
        const height = Math.max(4, (v / max) * 100);
        return (
          <div
            key={i}
            data-sparkline-bar
            className="rounded-full"
            style={{
              width: isActive ? "4px" : "3px",
              height: `${height}%`,
              backgroundColor: isActive ? "#232323" : "#BFBFBC",
              opacity: isActive ? 1 : 0.4,
            }}
          />
        );
      })}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  trend,
  previousValue,
  sparklineValues,
  icon,
}: {
  label: string;
  value: string;
  trend?: number;
  previousValue?: number;
  sparklineValues?: number[];
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
      className="min-h-[92px] rounded-2xl bg-black/[0.04] px-5 py-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-[8px] font-medium tracking-[0.3em] text-black/45 uppercase">{label}</p>
        <IconComponent weight="light" size={16} className="text-black/30" />
      </div>

      <div className="mt-1 flex items-end justify-between">
        <p className="text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{value}</p>
        {hasSparkline && <MiniSparkline values={sparklineValues} />}
      </div>

      {hasTrend && (
        <div className="mt-0.5 flex items-center gap-1">
          {isPositive ? (
            <TrendUp weight="light" size={12} className="text-emerald-600" />
          ) : (
            <TrendDown weight="light" size={12} className="text-red-500" />
          )}
          <span
            className={cn(
              "text-[11px] tabular-nums",
              isPositive ? "text-emerald-600" : "text-red-500"
            )}
          >
            {isPositive ? "+" : ""}
            {(trend ?? 0).toFixed(1)}%
          </span>
          <span className="text-[11px] text-black/40">vs prev</span>
        </div>
      )}
    </motion.div>
  );
}
