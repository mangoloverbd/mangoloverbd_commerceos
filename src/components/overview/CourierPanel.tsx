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
  const totalDelivered = couriers.reduce((sum, courier) => sum + courier.delivered, 0);
  const totalInTransit = couriers.reduce((sum, courier) => sum + courier.in_transit, 0);
  const totalPending = couriers.reduce((sum, courier) => sum + courier.pending, 0);
  const totalFailed = couriers.reduce((sum, courier) => sum + courier.failed, 0);
  const pipelineStatuses = [
    { key: "delivered", label: "Delivered", count: totalDelivered, color: "bg-emerald-500" },
    { key: "in-transit", label: "In transit", count: totalInTransit, color: "bg-blue-400" },
    { key: "pending", label: "Pending", count: totalPending, color: "bg-amber-400" },
    { key: "failed", label: "Failed", count: totalFailed, color: "bg-red-400" },
  ];

  return (
    <motion.div
      data-testid="overview-courier-panel"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="flex h-full flex-col rounded-2xl bg-black/[0.04] p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[8px] font-medium tracking-[0.3em] text-black uppercase">Delivery</p>
          <p className="text-[15px] font-semibold text-black mt-0.5">Courier Performance</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-black">Success Rate</p>
          <p className="text-[18px] font-semibold text-black tabular-nums">{overallSuccess.toFixed(1)}%</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-x-3 gap-y-3 border-y border-black/[0.08] py-3 sm:grid-cols-5">
        <div data-testid="courier-total-shipments">
          <p className="text-[9px] text-black/55">Total shipments</p>
          <p className="mt-0.5 text-[17px] font-light tabular-nums tracking-[-0.04em] text-black">{totalAll}</p>
        </div>
        <div>
          <p className="text-[9px] text-black/55">Delivered</p>
          <p className="mt-0.5 text-[17px] font-light tabular-nums tracking-[-0.04em] text-black">{totalDelivered}</p>
        </div>
        <div data-testid="courier-total-in-transit">
          <p className="text-[9px] text-black/55">In transit</p>
          <p className="mt-0.5 text-[17px] font-light tabular-nums tracking-[-0.04em] text-black">{totalInTransit}</p>
        </div>
        <div data-testid="courier-total-pending">
          <p className="text-[9px] text-black/55">Pending</p>
          <p className="mt-0.5 text-[17px] font-light tabular-nums tracking-[-0.04em] text-black">{totalPending}</p>
        </div>
        <div data-testid="courier-total-failed">
          <p className="text-[9px] text-black/55">Failed</p>
          <p className="mt-0.5 text-[17px] font-light tabular-nums tracking-[-0.04em] text-black">{totalFailed}</p>
        </div>
      </div>

      <div className="space-y-3">
        {couriers.map((c) => (
          <div key={c.name} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-black">{c.name}</span>
              <span className="text-[11px] text-black tabular-nums">{c.successRate}%</span>
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
            <div data-testid={`courier-${c.name.toLowerCase()}-details`} className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-black/65">
              <span>{c.delivered} delivered</span>
              <span>{c.in_transit} in transit</span>
              <span>{c.pending} pending</span>
              <span>{c.failed} failed</span>
              <span>{c.total} total</span>
            </div>
          </div>
        ))}
      </div>

      <div data-testid="courier-delivery-pipeline" className="mt-auto border-t border-black/[0.08] pt-4">
        <div className="flex items-center justify-between">
          <p className="text-[8px] font-medium uppercase tracking-[0.25em] text-black/60">Delivery pipeline</p>
          <span className="text-[10px] text-black/45">Share of shipments</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          {pipelineStatuses.map((status) => {
            const share = totalAll > 0 ? (status.count / totalAll) * 100 : 0;
            return (
              <div key={status.key} data-testid={`courier-pipeline-${status.key}`}>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-black/65">{status.label}</span>
                  <span className="tabular-nums text-black/55">{share.toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                  <div className={`h-full rounded-full ${status.color}`} style={{ width: `${share}%` }} />
                </div>
                <p className="mt-1 text-[9px] tabular-nums text-black/55">{status.count} shipments</p>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
