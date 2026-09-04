import { motion } from "framer-motion";
import type { ReactNode } from "react";

type WarehouseMetricProps = { label: string; value: ReactNode; detail: string };

export function WarehouseMetric({ label, value, detail }: WarehouseMetricProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="min-h-[92px] rounded-2xl bg-black/[0.04] px-5 py-3"
    >
      <p className="text-[8px] font-medium tracking-[0.3em] text-black/45 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{value}</p>
      <p className="mt-0.5 text-[11px] text-black/40">{detail}</p>
    </motion.div>
  );
}
