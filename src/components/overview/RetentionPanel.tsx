import { motion } from "framer-motion";
import { Crown } from "@phosphor-icons/react";

interface RetentionData {
  repeatRate: number;
  repeatCustomers: number;
  totalCustomers: number;
  topCustomers: Array<{ name: string; phone: string; orderCount: number; totalSpent: number }>;
}

function fmtBDT(n: number) {
  return "৳" + n.toLocaleString("en-BD", { maximumFractionDigits: 0 });
}

export function RetentionPanel({ data }: { data: RetentionData }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.3 }}
      className="rounded-xl border border-black/[0.06] bg-white p-5"
    >
      <div className="mb-4">
        <p className="text-[8px] font-medium tracking-[0.3em] text-black/40 uppercase">Customers</p>
        <p className="text-[15px] font-semibold text-black mt-0.5">Retention</p>
      </div>

      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <p className="text-[28px] font-light text-black tabular-nums">{data.repeatRate}%</p>
          <p className="text-[11px] text-black/40">repeat rate</p>
        </div>
        <p className="text-[11px] text-black/50 mt-1">
          {data.repeatCustomers} of {data.totalCustomers} customers are repeat buyers
        </p>
        <div className="mt-2 h-2 w-full bg-black/[0.04] rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${data.repeatRate}%` }}
          />
        </div>
      </div>

      {data.topCustomers.length > 0 && (
        <div>
          <p className="text-[9px] font-medium tracking-[0.2em] text-black/30 uppercase mb-2">Top Customers</p>
          <div className="space-y-1.5">
            {data.topCustomers.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5">
                  {i === 0 && <Crown weight="light" size={12} className="text-amber-500" />}
                  <span className="text-black/70">{c.name || c.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-black/40">{c.orderCount} orders</span>
                  <span className="font-medium text-black tabular-nums">{fmtBDT(c.totalSpent)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
