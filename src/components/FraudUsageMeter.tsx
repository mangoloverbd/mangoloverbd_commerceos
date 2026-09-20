import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { FRAUD_QUOTA_RESERVE } from "@/lib/fraudRisk";

type FraudUsage = {
  daily_limit?: number;
  used_today?: number;
  remaining_today?: number;
  limit_resets_at?: string;
  package?: { name?: string; days_remaining?: number } | null;
};

const LABEL = "text-[8px] font-medium uppercase tracking-[0.3em] text-black";

export function FraudUsageMeter() {
  const { data } = useQuery<FraudUsage>({
    queryKey: ["/api/fraud/usage"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await apiFetch("/api/fraud/usage");
      if (!res.ok) throw new Error("Could not read FraudShield usage");
      return res.json();
    },
  });

  const limit = data?.daily_limit;
  const used = data?.used_today ?? 0;
  const remaining = data?.remaining_today ?? 0;
  if (!Number.isFinite(limit)) return null;

  const low = remaining <= FRAUD_QUOTA_RESERVE;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const resets = data?.limit_resets_at
    ? new Date(data.limit_resets_at).toLocaleTimeString("en-BD", { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <section aria-label="FraudShield daily usage" className="mb-4 rounded-lg bg-[#FAFAF8] px-5 py-4 ring-1 ring-inset ring-black/[0.06]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ShieldCheck weight="light" size={18} className="text-black" />
        <p className={LABEL}>FraudShield today</p>
        <p className={`text-2xl font-light tabular-nums ${low ? "text-[#d05555]" : "text-black"}`}>{remaining}</p>
        <p className="text-[12px] text-black/55">
          remaining · {used} used of {limit}
          {resets ? ` · resets ${resets}` : ""}
        </p>
        {data?.package?.name && (
          <p className="ml-auto text-[12px] text-black/55">
            {data.package.name}
            {Number.isFinite(data.package.days_remaining) ? ` · ${data.package.days_remaining} days left` : ""}
          </p>
        )}
      </div>
      <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-black/[0.08]">
        <div className={`h-full rounded-full ${low ? "bg-[#d05555]" : "bg-[#2e9e5b]"}`} style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}
