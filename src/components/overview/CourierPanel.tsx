import { motion } from "framer-motion";

interface CourierData {
  [key: string]: { delivered: number; in_transit: number; failed: number; pending: number };
}

export function CourierPanel({ data }: { data: CourierData }) {
  const couriers = Object.entries(data).map(([name, stats]) => {
    const total = stats.delivered + stats.in_transit + stats.failed + stats.pending;
    const successRate = total > 0
      ? ((stats.delivered + stats.in_transit * 0.5) / total) * 100
      : 0;
    return { name: name.charAt(0).toUpperCase() + name.slice(1), ...stats, total, successRate: Math.round(successRate * 10) / 10 };
  });

  const totalAll = couriers.reduce((s, c) => s + c.total, 0);
  const totalEffective = couriers.reduce((s, c) => s + c.delivered + c.in_transit * 0.5, 0);
  const overallSuccess = totalAll > 0
    ? (totalEffective / totalAll) * 100
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="rounded-2xl bg-black/[0.04] p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[8px] font-medium tracking-[0.3em] text-black/40 uppercase">Delivery</p>
          <p className="text-[15px] font-semibold text-black mt-0.5">Courier Performance</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-black/40">Success Rate</p>
          <p className="text-[18px] font-semibold text-black tabular-nums">{overallSuccess.toFixed(1)}%</p>
        </div>
      </div>

      <div className="space-y-3">
        {couriers.map((c) => (
          <div key={c.name} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-black">{c.name}</span>
              <span className="text-[11px] text-black/50 tabular-nums">{c.successRate}%</span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-black/[0.04]">
              {c.delivered > 0 && (
                <div className="bg-emerald-500 transition-all" style={{ width: `${(c.delivered / c.total) * 100}%` }} />
              )}
              {c.in_transit > 0 && (
                <div className="bg-blue-400 transition-all" style={{ width: `${(c.in_transit / c.total) * 100}%` }} />
              )}
              {c.pending > 0 && (
                <div className="bg-amber-400 transition-all" style={{ width: `${(c.pending / c.total) * 100}%` }} />
              )}
              {c.failed > 0 && (
                <div className="bg-red-400 transition-all" style={{ width: `${(c.failed / c.total) * 100}%` }} />
              )}
            </div>
            <div className="flex gap-3 text-[9px] text-black/40">
              <span>{c.delivered} delivered</span>
              <span>{c.in_transit} in transit</span>
              <span>{c.failed} failed</span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
