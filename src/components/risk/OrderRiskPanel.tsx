import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Browser, Clock, Globe, HardDrives, MapPin, Phone, ShieldCheck, ShieldWarning, User, WarningCircle, WifiHigh } from "@phosphor-icons/react";
import { Chip } from "@/components/base/badges/chip";
import { Spinner } from "@/components/ui/ios-spinner";
import { fetchOrderRisk, reasonLabel, visibleRiskSignals, type RiskAttempt, type RiskSignal } from "@/lib/orderRisk";

type ChipColor = "lime" | "rose" | "yellow" | "cyan" | "blue" | "purple" | "neutral" | "gray" | "soft";

const DECISIONS: Record<RiskAttempt["decision"], { label: string; color: ChipColor; bar: string; summary: string }> = {
  ALLOW: { label: "Allowed", color: "lime", bar: "bg-lime-500", summary: "Checkout went through without review." },
  HOLD: { label: "Held for review", color: "yellow", bar: "bg-amber-400", summary: "Signals were strong enough to hold this order for staff review." },
  BLOCK: { label: "Blocked", color: "rose", bar: "bg-rose-500", summary: "Signals were strong enough to block this checkout." },
};

const SEVERITIES: Record<string, { label: string; color: ChipColor }> = {
  critical: { label: "Critical", color: "rose" },
  high: { label: "High", color: "rose" },
  medium: { label: "Medium", color: "yellow" },
  low: { label: "Low", color: "blue" },
  trust: { label: "Trust", color: "lime" },
};

const severityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, trust: 4 };

function titleCase(value: string) {
  return value.toLowerCase().replace(/(^|_)\w/g, (match) => match.replace("_", " ").toUpperCase());
}

function formatPoints(points: number) {
  return points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : "0";
}

// ip_prefix is the stored network block ("v4:103.12.44.0/24" or "v6:2001:db8:0:0::/64").
function formatIpBlock(prefix: string | null | undefined) {
  if (!prefix) return null;
  if (prefix.startsWith("v4:")) return `${prefix.slice(3).split(".").slice(0, 3).join(".")}.x`;
  if (prefix.startsWith("v6:")) return prefix.slice(3).replace(/::\/64$/, "::…");
  return prefix;
}

function ipDisplay(attempt: RiskAttempt) {
  if (attempt.ip_address) return attempt.ip_address;
  const block = formatIpBlock(attempt.ip_prefix);
  return block ? `${block} · full IP not saved` : "Not recorded";
}

function formatAssessedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3 px-1">
        <h3 className="text-[13px] font-semibold text-black">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex min-h-[46px] items-center gap-3 px-3 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/[0.05] text-black/70">
        <Icon weight="light" size={15} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] text-black/50">{label}</p>
        <p className="truncate text-[13px] text-black">{value}</p>
      </div>
    </div>
  );
}

function SignalRow({ signal }: { signal: RiskSignal }) {
  const severity = SEVERITIES[signal.severity] ?? { label: titleCase(signal.severity || "Signal"), color: "neutral" as ChipColor };
  const trust = signal.points < 0;
  return (
    <li className="flex items-start gap-3 rounded-xl bg-white px-3 py-2.5">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${trust ? "bg-lime-500" : signal.points >= 40 ? "bg-rose-500" : signal.points >= 20 ? "bg-amber-400" : "bg-blue-400"}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-medium text-black">{signal.label ?? titleCase(signal.code)}</span>
          <Chip variant="caption" color={severity.color}>{severity.label}</Chip>
          {signal.family && <Chip variant="caption" color="soft">{titleCase(signal.family)}</Chip>}
        </div>
        {signal.evidence && <p className="mt-1 text-[11px] leading-snug text-black/55">{signal.evidence}</p>}
      </div>
      <span className={`shrink-0 font-mono text-[13px] tabular-nums ${trust ? "text-lime-700" : "text-black"}`}>{formatPoints(signal.points)}</span>
    </li>
  );
}

function RiskAssessment({ attempt }: { attempt: RiskAttempt }) {
  const reduceMotion = useReducedMotion();
  const decision = DECISIONS[attempt.decision] ?? { label: attempt.decision, color: "neutral" as ChipColor, bar: "bg-black/60", summary: "" };
  const score = Math.max(0, Math.min(100, Number(attempt.score) || 0));
  const signals = [...visibleRiskSignals(attempt.signals || [])].sort((a, b) =>
    (severityRank[a.severity] ?? 5) - (severityRank[b.severity] ?? 5) || b.points - a.points);
  const riskPoints = signals.filter((signal) => signal.points > 0).reduce((sum, signal) => sum + signal.points, 0);
  const trustPoints = signals.filter((signal) => signal.points < 0).reduce((sum, signal) => sum + signal.points, 0);
  const assessedAt = formatAssessedAt(attempt.created_at);
  const DecisionIcon = attempt.decision === "ALLOW" ? ShieldCheck : ShieldWarning;
  const hasFindings = signals.length > 0 || (attempt.reasons || []).length > 0;
  const customerSection = (
    <Section title="Customer">
      <div className="flex-1 divide-y divide-black/[0.06] overflow-hidden rounded-2xl bg-black/[0.04]">
        <DetailRow icon={User} label="Name" value={attempt.customer_name || "Unknown"} />
        <DetailRow icon={Phone} label="Phone" value={attempt.phone || "No phone"} />
        <DetailRow icon={MapPin} label="Address" value={attempt.address || "No address provided"} />
      </div>
    </Section>
  );
  const networkSection = (
    <Section title="Network & device">
      <div className="flex-1 divide-y divide-black/[0.06] overflow-hidden rounded-2xl bg-black/[0.04]">
        <DetailRow icon={HardDrives} label="IP address" value={ipDisplay(attempt)} />
        <DetailRow icon={WifiHigh} label="Network" value={attempt.network_type || "Unknown network"} />
        <DetailRow icon={Globe} label="City" value={attempt.geo_city || "Unknown city"} />
        <DetailRow icon={Browser} label="Browser" value={attempt.user_agent_summary || "Unknown browser"} />
      </div>
    </Section>
  );

  return (
    <div className="space-y-6 p-4 sm:p-5">
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.3 }}
        className="rounded-2xl bg-black/[0.04] p-4 sm:p-5"
        aria-label="Risk decision"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-black">
              <DecisionIcon weight="light" size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Risk decision</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Chip variant="subtle" color={decision.color}>{decision.label}</Chip>
                <Chip variant="caption" color={attempt.mode === "shadow" ? "soft" : "purple"}>{attempt.mode === "shadow" ? "Shadow · not enforced" : "Active · enforced"}</Chip>
                <Chip variant="caption" color={attempt.context_trusted ? "cyan" : "yellow"}>{attempt.context_trusted ? "Signed context" : "Unverified context"}</Chip>
                {!hasFindings && <Chip variant="caption" color="lime">No risk signals</Chip>}
              </div>
              {decision.summary && <p className="mt-2 text-[12px] text-black/60">{decision.summary}</p>}
            </div>
          </div>
          <div data-testid="order-risk-score" className="shrink-0 sm:text-right">
            <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Score</p>
            <p className="mt-1 font-light tabular-nums tracking-[-0.04em] text-black">
              <span className="text-[34px] leading-none">{attempt.score}</span>
              <span className="ml-1 text-[13px] text-black/45">/ 100</span>
            </p>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/[0.07]" aria-hidden="true">
          <motion.div
            className={`h-full rounded-full ${decision.bar}`}
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: reduceMotion ? 0 : 0.6, ease: "easeOut" }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] tabular-nums text-black/55">
          {riskPoints > 0 && <span>Risk points <span className="text-black">{formatPoints(riskPoints)}</span></span>}
          {trustPoints < 0 && <span>Trust points <span className="text-lime-700">{formatPoints(trustPoints)}</span></span>}
          {assessedAt && <span className="inline-flex items-center gap-1"><Clock weight="light" size={12} />{assessedAt}</span>}
        </div>
      </motion.section>

      {!hasFindings ? (
        <div data-testid="order-risk-details" className="grid gap-6 lg:grid-cols-2">
          {customerSection}
          {networkSection}
        </div>
      ) : (
      <div data-testid="order-risk-details" className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {(attempt.reasons || []).length > 0 && (
            <Section title="Why this decision">
              <ul aria-label="Decision reasons" className="space-y-1.5">
                {attempt.reasons.map((reason) => (
                  <li key={reason} className="flex items-start gap-2 rounded-xl bg-white px-3 py-2.5 text-[13px] text-black">
                    <WarningCircle weight="light" size={16} className="mt-0.5 shrink-0 text-black/50" />
                    {reasonLabel(reason)}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {signals.length > 0 && (
            <Section title="Signals" aside={<Chip variant="caption" color="soft">{signals.length} {signals.length === 1 ? "signal" : "signals"}</Chip>}>
              <ul aria-label="Risk signals" className="space-y-1.5 rounded-2xl bg-black/[0.04] p-1.5">
                {signals.map((signal) => <SignalRow key={signal.code} signal={signal} />)}
              </ul>
            </Section>
          )}
        </div>

        <div className="space-y-6">
          {customerSection}
          {networkSection}
        </div>
      </div>
      )}
      {attempt.review_id && <p className="px-1 text-[11px] text-black/50">Held review · {attempt.review_id}</p>}
    </div>
  );
}

export function OrderRiskPanel({ orderId }: { orderId: string }) {
  const { data, isPending, error } = useQuery({ queryKey: ["order-risk", orderId], queryFn: () => fetchOrderRisk(orderId), staleTime: 30_000 });
  if (isPending) return <div role="status" className="flex min-h-40 items-center justify-center gap-2 text-[13px] text-black/60"><Spinner size="sm" /> Loading risk assessment…</div>;
  if (error) return <p role="alert" className="m-4 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">Could not load risk assessment.</p>;
  if (!data?.attempt) return <p className="m-4 rounded-2xl bg-black/[0.03] px-4 py-10 text-center text-[13px] text-black/55">No risk assessment was recorded for this order.</p>;
  return <RiskAssessment attempt={data.attempt} />;
}
