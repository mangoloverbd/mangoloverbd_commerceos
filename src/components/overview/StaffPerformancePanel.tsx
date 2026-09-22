import { motion } from "framer-motion";

export interface StaffPerformancePanelData {
  assignedCount: number;
  confirmedCount: number;
  confirmedValue: number;
  confirmationRate: number;
  deliveredRate: number;
  topStaff: Array<{
    userId: string;
    name: string;
    confirmedCount: number;
    confirmedValue: number;
    deliveredRate: number;
  }>;
}

function formatTaka(value: number) {
  return `৳${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("en-BD");
}

function formatRate(value: number) {
  return `${(Number(value || 0) * 100).toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`;
}

function SummaryMetric({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div data-testid={testId}>
      <p className="text-[9px] text-black/55">{label}</p>
      <p className="mt-0.5 text-[17px] font-light tabular-nums tracking-[-0.04em] text-black">{value}</p>
    </div>
  );
}

export function StaffPerformancePanel({ data }: { data: StaffPerformancePanelData }) {
  return (
    <motion.div
      data-testid="overview-staff-performance"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.25 }}
      className="flex h-full flex-col rounded-2xl bg-black/[0.04] p-5"
    >
      <div className="mb-4">
        <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">People</p>
        <p className="mt-0.5 text-[15px] font-semibold text-black">Staff Performance</p>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-black/[0.08] py-3">
        <SummaryMetric label="Assigned orders" value={formatNumber(data.assignedCount)} testId="overview-staff-assigned-orders" />
        <SummaryMetric label="Confirmed orders" value={formatNumber(data.confirmedCount)} testId="overview-staff-confirmed-orders" />
        <SummaryMetric label="Confirmed value" value={formatTaka(data.confirmedValue)} testId="overview-staff-confirmed-value" />
        <SummaryMetric label="Delivered rate" value={formatRate(data.deliveredRate)} testId="overview-staff-delivered-rate" />
      </div>

      {data.topStaff.length > 0 ? (
        <div data-testid="overview-staff-top-section" className="mt-auto space-y-2 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-[8px] font-medium uppercase tracking-[0.25em] text-black/60">Top staff</p>
            <span className="text-[10px] text-black/45">By confirmed value</span>
          </div>
          {data.topStaff.map((member, index) => (
            <div
              key={member.userId}
              data-testid={`overview-staff-top-${member.userId}`}
              className="flex items-center gap-2 border-t border-black/[0.06] pt-2"
            >
              <span className="w-4 text-[10px] tabular-nums text-black/40">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-black">{member.name}</span>
              <span className="text-right">
                <span className="block text-[12px] font-medium tabular-nums text-black">{formatTaka(member.confirmedValue)}</span>
                <span className="block text-[9px] tabular-nums text-black/55">
                  {formatNumber(member.confirmedCount)} orders · {formatRate(member.deliveredRate)} delivered
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p data-testid="overview-staff-empty" className="mt-auto border-t border-black/[0.06] pt-4 text-[11px] text-black/55">No staff-attributed activity</p>
      )}
    </motion.div>
  );
}
