import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";

interface OrderVolumeData {
  date: string;
  current: number;
  previous: number;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const current = payload.find((p) => p.dataKey === "current");
  const previous = payload.find((p) => p.dataKey === "previous");
  const change = current && previous && previous.value > 0
    ? (((current.value - previous.value) / previous.value) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 shadow-lg">
      <p className="text-[10px] font-medium text-black/50 mb-1">{label}</p>
      <p className="text-[12px] font-semibold text-black">This period: {current?.value ?? 0}</p>
      <p className="text-[11px] text-black/50">Previous: {previous?.value ?? 0}</p>
      <p className={`text-[11px] font-medium ${Number(change) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
        {Number(change) >= 0 ? "+" : ""}{change}% vs previous
      </p>
    </div>
  );
}

export function OrderVolumeChart({ data }: { data: OrderVolumeData[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="rounded-xl border border-black/[0.06] bg-white p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[8px] font-medium tracking-[0.3em] text-black/40 uppercase">Orders</p>
          <p className="text-[15px] font-semibold text-black mt-0.5">Order Volume</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-[#232323]" />
            <span className="text-[10px] text-black/50">This period</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-black/15" />
            <span className="text-[10px] text-black/50">Previous</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
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
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="previous"
            stroke="rgba(0,0,0,0.15)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            fill="rgba(0,0,0,0.02)"
          />
          <Area
            type="monotone"
            dataKey="current"
            stroke="#232323"
            strokeWidth={2}
            fill="rgba(35,35,35,0.08)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
