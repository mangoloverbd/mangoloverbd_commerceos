export type FraudLevel = "safe" | "caution" | "high" | "unknown";

type FraudSummary = { success_rate?: number | null; fraud_risk?: string | null; total_parcels?: number | null } | null;
type FraudPayload = {
  courierData?: Record<string, { name?: string; logo?: string; total_parcel?: number; success_parcel?: number; success_ratio?: number }>;
  reviews?: Array<{ commenter_phone?: string; rating?: number; comment?: string; created_at?: string }>;
  fraudRiskScore?: { score?: number; level?: string; label?: string; breakdown?: Record<string, number> };
} | null;

// FraudShield's own level wins. The fallback mirrors the server's derivation
// so a payload predating fraudRiskScore still lands somewhere sensible.
export function resolveFraudLevel(payload: FraudPayload, summary: FraudSummary): FraudLevel {
  const raw = (payload?.fraudRiskScore?.level ?? summary?.fraud_risk ?? "").toLowerCase();
  if (raw === "safe" || raw === "low") return "safe";
  if (raw === "caution" || raw === "medium" || raw === "moderate") return "caution";
  if (raw === "high" || raw === "risky") return "high";

  const rate = summary?.success_rate;
  if (typeof rate !== "number") return "unknown";
  if (rate >= 70) return "safe";
  if (rate >= 50) return "caution";
  return "high";
}

// Reuses the order-status pill palette already in CustomerPanel.tsx — no new tokens.
export const RISK_STYLES: Record<FraudLevel, { pill: string; strip: string; accent: string; label: string }> = {
  safe:    { pill: "bg-[#e3f5e9] text-[#2e9e5b]", strip: "",                accent: "text-[#2e9e5b]", label: "Safe" },
  caution: { pill: "bg-[#fdf3e3] text-[#b97f1f]", strip: "bg-[#fdf3e3]",    accent: "text-[#b97f1f]", label: "Caution" },
  high:    { pill: "bg-[#fdecec] text-[#d05555]", strip: "bg-[#fdecec]",    accent: "text-[#d05555]", label: "High risk" },
  unknown: { pill: "bg-black/[0.05] text-black/60", strip: "",              accent: "text-black",     label: "Unknown" },
};

export function maskPhone(phone: string | null | undefined): string {
  const clean = String(phone || "").replace(/\D/g, "");
  return clean.length === 11 ? `${clean.slice(0, 3)}****${clean.slice(7)}` : "—";
}

export function relativeAge(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Human labels for the fraudRiskScore.breakdown components. The live API
// sends score-part keys (success_component, …) plus counters (report_count,
// total_reviews) — never render the raw snake_case keys.
const BREAKDOWN_LABELS: Record<string, string> = {
  success_component: "Success",
  report_component: "Reports",
  cancel_component: "Cancels",
  volume_component: "Volume",
  report_count: "Reports filed",
  total_reviews: "Reviews",
};

export function breakdownRows(breakdown: Record<string, number> | null | undefined) {
  return Object.entries(breakdown || {}).map(([key, value]) => ({
    key,
    label: BREAKDOWN_LABELS[key] ?? key.replace(/_/g, " "),
    value,
    // A non-zero report or cancel component is what pushes the score up.
    alert: /report|cancel/i.test(key) && Number(value) > 0,
  }));
}

export function courierRows(payload: FraudPayload) {
  return Object.entries(payload?.courierData || {})
    .filter(([key]) => key !== "summary")
    .map(([key, courier]) => {
      const total = courier.total_parcel ?? 0;
      const success = courier.success_parcel ?? 0;
      return {
        key,
        name: courier.name ?? key,
        logo: courier.logo ?? null,
        total,
        success,
        ratio: courier.success_ratio ?? (total > 0 ? Math.round((success / total) * 100) : 0),
      };
    });
}

// Mirrors FRAUD_QUOTA_RESERVE in server/fraudShield.js — the request budget
// held back from automated warming for interactive re-checks.
export const FRAUD_QUOTA_RESERVE = 100;
