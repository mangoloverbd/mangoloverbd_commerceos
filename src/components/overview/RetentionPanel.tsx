import { motion } from "framer-motion";
import { Crown } from "@phosphor-icons/react";

interface RetentionData {
  repeatRate: number;
  repeatCustomers: number;
  totalCustomers: number;
  averageOrdersPerCustomer: number;
  averageCustomerValue: number;
  topCustomers: Array<{ name: string; phone: string; orderCount: number; totalSpent: number }>;
}

function fmtBDT(n: number) {
  return "৳" + n.toLocaleString("en-BD", { maximumFractionDigits: 0 });
}

export function RetentionPanel({ data }: { data: RetentionData }) {
  return (
    <motion.div
      data-testid="overview-retention-panel"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.3 }}
      className="flex h-full flex-col rounded-2xl bg-black/[0.04] p-5"
    >
      <div className="mb-4">
        <p className="text-[8px] font-medium tracking-[0.3em] text-black uppercase">Customers</p>
        <p className="text-[15px] font-semibold text-black mt-0.5">Retention</p>
      </div>

      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <p className="text-[28px] font-light text-black tabular-nums">{data.repeatRate}%</p>
          <p className="text-[11px] text-black">repeat rate</p>
        </div>
        <p className="text-[11px] text-black mt-1">
          {data.repeatCustomers} of {data.totalCustomers} customers are repeat buyers
        </p>
        <div className="mt-2 h-2 w-full bg-black/[0.04] rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${data.repeatRate}%` }}
          />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-black/[0.08] py-3">
        <div data-testid="retention-total-customers">
          <p className="text-[9px] text-black/55">Total customers</p>
          <p className="mt-0.5 text-[17px] font-light tabular-nums tracking-[-0.04em] text-black">{data.totalCustomers}</p>
        </div>
        <div data-testid="retention-repeat-customers">
          <p className="text-[9px] text-black/55">Repeat customers</p>
          <p className="mt-0.5 text-[17px] font-light tabular-nums tracking-[-0.04em] text-black">{data.repeatCustomers}</p>
        </div>
        <div data-testid="retention-average-orders">
          <p className="text-[9px] text-black/55">Avg. orders / customer</p>
          <p className="mt-0.5 text-[17px] font-light tabular-nums tracking-[-0.04em] text-black">{data.averageOrdersPerCustomer.toFixed(1)}</p>
        </div>
        <div data-testid="retention-average-value">
          <p className="text-[9px] text-black/55">Avg. customer value</p>
          <p className="mt-0.5 text-[17px] font-light tabular-nums tracking-[-0.04em] text-black">{fmtBDT(data.averageCustomerValue)}</p>
        </div>
      </div>

      {data.topCustomers.length > 0 && (
        <div>
          <p className="text-[9px] font-medium tracking-[0.2em] text-black uppercase mb-2">Top Customers</p>
          <div className="space-y-1.5">
            {data.topCustomers.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5">
                  {i === 0 && <Crown weight="light" size={12} className="text-amber-500" />}
                  <span className="text-black">{c.name || c.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-black">{c.orderCount} orders</span>
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
