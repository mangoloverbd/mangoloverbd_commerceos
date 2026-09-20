import { useEffect, useState } from "react";
import { ArrowClockwise, CaretDown, CaretUp, ShieldCheck, ShieldWarning } from "@phosphor-icons/react";
import { useFraudCheckMutation, useFraudLookup } from "@/hooks/useFraudCheck";
import { RISK_STYLES, courierRows, maskPhone, relativeAge, resolveFraudLevel } from "@/lib/fraudRisk";
import { normalizeBdPhone } from "@/lib/bdPhone";

const LABEL = "text-[8px] font-medium uppercase tracking-[0.3em]";
const QUOTA_RE = /daily FraudShield limit/i;

export function FraudPanel({ phone, className = "" }: { phone?: string | null; className?: string }) {
  const normalized = normalizeBdPhone(phone);
  const lookup = useFraudLookup(phone);
  const check = useFraudCheckMutation(phone);
  const [expanded, setExpanded] = useState(false);

  const data = lookup.data;
  const payload = (data?.payload ?? null) as Parameters<typeof courierRows>[0];
  const summary = (data?.summary ?? null) as { total_parcels?: number; total_delivered?: number; total_cancel?: number; success_rate?: number; fraud_risk?: string } | null;
  const level = resolveFraudLevel(payload, summary);
  const styles = RISK_STYLES[level];

  const hasData = Boolean(payload && summary);
  const isNewCustomer = hasData && (summary?.total_parcels ?? 0) === 0;
  const quotaBlocked = QUOTA_RE.test(data?.errorMessage || "");
  // A quota error is not a failed check — it is a blocked one. It keeps the
  // Check affordance (disabled) rather than offering a Retry that cannot work.
  const failed = data?.status === "error" && !hasData && !quotaBlocked;
  const busy = lookup.isPending || check.isPending || data?.status === "pending";

  // The state that needs attention presents itself; safe stays one quiet row.
  useEffect(() => {
    if (level === "high" && hasData) setExpanded(true);
  }, [level, hasData]);

  if (!normalized) return null;

  const reviews = payload?.reviews;
  const couriers = courierRows(payload);
  const tint = hasData && !isNewCustomer ? styles.strip : "";

  return (
    <section aria-label="Customer risk" className={`overflow-hidden rounded-lg ring-1 ring-inset ring-black/[0.06] ${className}`}>
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${tint}`}>
        <p className={`${LABEL} ${tint ? styles.accent : "text-black"}`}>Customer risk</p>

        {busy ? (
          <span className="text-[12px] text-black/50">Loading…</span>
        ) : quotaBlocked && !hasData ? (
          <span className="text-[12px] text-black/50">Daily limit reached</span>
        ) : failed ? (
          <>
            <span className="text-[12px] text-[#d05555]">Check failed</span>
            <span className="min-w-0 truncate text-[11px] text-black/50">{data?.errorMessage}</span>
          </>
        ) : !hasData ? (
          <span className="text-[12px] text-black/50">Not checked yet</span>
        ) : isNewCustomer ? (
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${RISK_STYLES.unknown.pill}`}>New customer</span>
        ) : (
          <>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles.pill}`}>
              {level === "safe" ? <ShieldCheck weight="light" size={14} /> : <ShieldWarning weight="light" size={14} />}
              {styles.label}
            </span>
            <span className={`text-[15px] font-medium tabular-nums ${styles.accent}`}>{summary?.success_rate ?? 0}%</span>
            <span className="text-[12px] tabular-nums text-black/55">
              {summary?.total_delivered ?? 0} delivered · {summary?.total_cancel ?? 0} cancelled · {summary?.total_parcels ?? 0} total
            </span>
            {payload?.fraudRiskScore && (
              <span className="text-[12px] text-black/55">
                risk {payload.fraudRiskScore.score}/100{payload.fraudRiskScore.label ? ` · ${payload.fraudRiskScore.label}` : ""}
              </span>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {data?.checkedAt && <span className="text-[11px] text-black/45">{relativeAge(data.checkedAt)}</span>}

          {hasData || failed ? (
            <button
              type="button"
              aria-label={failed ? "Retry" : "Re-check"}
              disabled={busy || quotaBlocked}
              onClick={() => check.mutate({ force: true })}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-black transition hover:bg-black/[0.05] disabled:opacity-40"
            >
              <ArrowClockwise weight="light" size={14} />
              {failed ? "Retry" : null}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || quotaBlocked}
              onClick={() => check.mutate({ force: false })}
              className="inline-flex h-8 items-center rounded-lg bg-black px-3 text-[12px] font-medium text-white transition hover:bg-black/90 disabled:opacity-40"
            >
              Check
            </button>
          )}

          {hasData && !isNewCustomer && (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] text-black transition hover:bg-black/[0.05]"
            >
              {expanded ? "Hide" : "Details"}
              {expanded ? <CaretUp weight="light" size={12} /> : <CaretDown weight="light" size={12} />}
            </button>
          )}
        </div>
      </div>

      {expanded && hasData && (
        <div className="grid gap-7 border-t border-black/[0.07] bg-[#FAFAF8] px-4 py-4 sm:grid-cols-2">
          <div className="min-w-0">
            <p className={`${LABEL} text-black`}>By courier</p>
            <ul className="mt-3 grid gap-2">
              {couriers.map((courier) => (
                <li key={courier.key} className="flex items-center gap-2.5">
                  {courier.logo
                    ? <img src={courier.logo} alt="" className="h-5 w-5 shrink-0 rounded" />
                    : <span className="h-5 w-5 shrink-0 rounded bg-black/[0.08]" />}
                  <span className="min-w-0 flex-1 truncate text-[12px] text-black">{courier.name}</span>
                  <span className="text-[12px] tabular-nums text-black/50">{courier.success}/{courier.total}</span>
                  <span className={`w-10 text-right text-[12px] font-semibold tabular-nums ${courier.ratio >= 70 ? "text-[#2e9e5b]" : courier.ratio >= 50 ? "text-[#b97f1f]" : "text-[#d05555]"}`}>
                    {courier.ratio}%
                  </span>
                </li>
              ))}
            </ul>

            {payload?.fraudRiskScore?.breakdown && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {Object.entries(payload.fraudRiskScore.breakdown).map(([key, value]) => (
                  <span
                    key={key}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] tabular-nums ${
                      (key === "reports" || key === "cancel") && value > 0 ? "bg-[#fdecec] text-[#d05555]" : "bg-black/[0.04] text-black"
                    }`}
                  >
                    {key} <b className="font-semibold">{value}</b>
                  </span>
                ))}
              </div>
            )}
          </div>

          {Array.isArray(reviews) && reviews.length > 0 && (
            <div className="min-w-0">
              <p className={`${LABEL} text-black`}>Reviews from other merchants</p>
              <ul className="mt-2 divide-y divide-black/[0.07]">
                {reviews.map((review, index) => (
                  <li key={`${review.commenter_phone}-${index}`} className="flex gap-2.5 py-2.5">
                    <span className={`shrink-0 text-[11px] ${(review.rating ?? 0) >= 4 ? "text-[#2e9e5b]" : "text-[#d05555]"}`}>
                      {"★".repeat(review.rating ?? 0)}{"☆".repeat(Math.max(0, 5 - (review.rating ?? 0)))}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12.5px] leading-snug text-black">{review.comment}</p>
                      <p className="mt-1 text-[11px] text-black/45">
                        {maskPhone(review.commenter_phone)}
                        {review.created_at ? ` · ${new Date(review.created_at).toLocaleDateString("en-BD")}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
