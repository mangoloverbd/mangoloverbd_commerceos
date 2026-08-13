import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { motion } from "framer-motion";

interface RevenueData {
  date: string;
  revenue: number;
  cog: number;
  shipping: number;
  profit: number;
}

function fmtBDT(n: number) {
  return "৳" + n.toLocaleString("en-BD", { maximumFractionDigits: 0 });
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 shadow-lg">
      <p className="text-[10px] font-medium text-black/50 mb-1.5">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 text-[11px]">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-black/60 capitalize">{entry.dataKey}</span>
          </div>
          <span className="font-medium text-black tabular-nums">{fmtBDT(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function RevenueChart({ data }: { data: RevenueData[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className="rounded-xl border border-black/[0.06] bg-white p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[8px] font-medium tracking-[0.3em] text-black/40 uppercase">Financials</p>
          <p className="text-[15px] font-semibold text-black mt-0.5">Revenue vs Costs</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "rgba(0,0,0,0.35)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "rgba(0,0,0,0.35)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `৳${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={6}
            wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }}
          />
          <Bar dataKey="cog" stackId="costs" fill="#D97706" radius={[0, 0, 0, 0]} name="COG" />
          <Bar dataKey="shipping" stackId="costs" fill="#3B82F6" radius={[0, 0, 0, 0]} name="Shipping" />
          <Bar dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} name="Revenue" />
          <Line
            type="monotone"
            dataKey="profit"
            stroke="#232323"
            strokeWidth={2}
            dot={false}
            name="Profit"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
