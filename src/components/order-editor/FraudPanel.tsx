import { useEffect, useState } from "react";
import { CaretDown, ShieldCheck, ShieldWarning } from "@phosphor-icons/react";
import { useFraudCheckMutation, useFraudLookup } from "@/hooks/useFraudCheck";
import { Chip } from "@/components/base/badges/chip";
import { RISK_STYLES, courierRows, maskPhone, relativeAge, resolveFraudLevel } from "@/lib/fraudRisk";
import { normalizeBdPhone } from "@/lib/bdPhone";

const QUOTA_RE = /daily FraudShield limit/i;

function RefreshIcon({ size = 14 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.01001 14.5101C8.19001 14.8101 8.41 15.0901 8.66 15.3401C10.5 17.1801 13.49 17.1801 15.34 15.3401C16.09 14.5901 16.52 13.64 16.66 12.67" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.33997 11.3301C7.47997 10.3501 7.90997 9.41003 8.65997 8.66003C10.5 6.82003 13.49 6.82003 15.34 8.66003C15.6 8.92003 15.81 9.20005 15.99 9.49005" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.81995 17.18V14.51H10.4899" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.18 6.82007V9.49005H13.51" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CourierLogo({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <span className="h-5 w-5 shrink-0 rounded bg-black/[0.08]" />;
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-5 w-5 shrink-0 rounded-sm object-contain"
    />
  );
}

export function FraudPanel({ phone, className = "", defaultExpanded = false, compact = false, alignHeader = "center" }: { phone?: string | null; className?: string; defaultExpanded?: boolean; compact?: boolean; alignHeader?: "left" | "center" }) {
  const normalized = normalizeBdPhone(phone);
  const lookup = useFraudLookup(phone);
  const check = useFraudCheckMutation(phone);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const data = lookup.data;
  const payload = (data?.payload ?? null) as Parameters<typeof courierRows>[0];
  const summary = (data?.summary ?? null) as { total_parcels?: number; total_delivered?: number; total_cancel?: number; success_rate?: number; fraud_risk?: string } | null;
  const level = resolveFraudLevel(payload, summary);
  const styles = RISK_STYLES[level];

  const hasData = Boolean(payload && summary);
  const isNewCustomer = hasData && (summary?.total_parcels ?? 0) === 0;
  const quotaBlocked = QUOTA_RE.test(data?.errorMessage || "");
  // A quota error is not a failed check — it is a blocked one. The cached
  // message can also be stale (quota resets daily), so the Check affordance
  // stays enabled: an explicit click spends at most one request and is the
  // only way to discover the quota is back.
  const failed = data?.status === "error" && !hasData && !quotaBlocked;
  const busy = lookup.isPending || check.isPending || data?.status === "pending";

  // The state that needs attention presents itself; safe stays one quiet row.
  useEffect(() => {
    if (level === "high" && hasData) setExpanded(true);
  }, [level, hasData]);

  if (!normalized) return null;

  const reviews = payload?.reviews;
  const couriers = courierRows(payload);
  const hasReviews = Array.isArray(reviews) && reviews.length > 0;
  const visibleCouriers = compact ? couriers.filter((courier) => courier.total > 0) : couriers;
  const hiddenCourierCount = couriers.length - visibleCouriers.length;
  const showRiskRow = hasData && !isNewCustomer && Boolean(payload?.fraudRiskScore);
  const showDetails = hasData && !isNewCustomer && !expanded;

  return (
    <section aria-label="Customer risk" className={className}>
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 ${alignHeader === "center" ? "justify-center" : "justify-start"}`}>
        {busy ? (
          <span className="text-[12px] text-black/50">Loading…</span>
        ) : quotaBlocked && !hasData ? (
          <span className="text-[12px] text-black/50">Daily limit reached</span>
        ) : failed ? (
          <>
            <span className="text-[12px] text-[#d05555]">Check failed</span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-black/50">{data?.errorMessage}</span>
          </>
        ) : !hasData ? (
          <span className="text-[12px] text-black/50">Not checked yet</span>
        ) : isNewCustomer ? (
          <span className="inline-flex items-center rounded-md bg-yellow-200 px-1.5 py-1 text-[12px] font-medium text-black">New customer</span>
        ) : (
          <>
            <Chip variant="caption" color={level === "safe" ? "lime" : level === "caution" ? "yellow" : level === "high" ? "rose" : "neutral"} className="gap-1 font-semibold">
              {level === "safe" ? <ShieldCheck weight="light" size={12} /> : <ShieldWarning weight="light" size={12} />}
              {styles.label}
            </Chip>
            <span className="text-[15px] font-bold tabular-nums text-black">{summary?.success_rate ?? 0}%</span>
            <Chip variant="caption" color="lime" className="font-semibold tabular-nums">{summary?.total_delivered ?? 0} delivered</Chip>
            <Chip variant="caption" color={(summary?.total_cancel ?? 0) > 0 ? "rose" : "neutral"} className="font-semibold tabular-nums">{summary?.total_cancel ?? 0} cancelled</Chip>
            <Chip variant="caption" color="neutral" className="font-semibold tabular-nums">{summary?.total_parcels ?? 0} total</Chip>
          </>
        )}
      </div>

      {showRiskRow && payload?.fraudRiskScore && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Chip variant="caption" color={level === "safe" ? "lime" : level === "caution" ? "yellow" : level === "high" ? "rose" : "neutral"} className="font-semibold tabular-nums">
            risk {payload.fraudRiskScore.score}/100
          </Chip>
          {payload.fraudRiskScore.label && (
            <Chip variant="caption" color="neutral" className="font-medium">
              {payload.fraudRiskScore.label}
            </Chip>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5">
            {data?.checkedAt && <span className="text-[11px] tabular-nums text-black/65">{relativeAge(data.checkedAt)}</span>}
            <button
              type="button"
              aria-label="Re-check"
              disabled={busy}
              onClick={() => check.mutate({ force: true })}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-black/[0.04] px-2.5 text-black transition hover:bg-black/[0.08] disabled:opacity-40"
            >
              <RefreshIcon size={18} />
            </button>
          </span>
        </div>
      )}

      {expanded && hasData && (
        <div className={`mt-4 grid gap-7 border-t border-black/[0.08] pt-4 ${hasReviews ? "sm:grid-cols-2" : ""}`}>
          <div className="min-w-0">
            <p className="text-[8px] font-medium uppercase tracking-[0.2em] text-black/55">By courier</p>
            <ul className={`mt-3 grid gap-2.5 ${compact ? "max-h-56 overflow-y-auto pr-1" : ""}`}>
              {visibleCouriers.map((courier) => (
                <li key={courier.key} className="flex items-center gap-2.5">
                  <CourierLogo key={`${courier.key}-${data?.checkedAt ?? "none"}`} src={courier.logo} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-black">{courier.name}</span>
                  <span className="text-[12px] tabular-nums text-black/50">{courier.success}/{courier.total}</span>
                  <span className="flex w-14 justify-end">
                    <Chip variant="caption" color={courier.ratio >= 70 ? "lime" : courier.ratio >= 50 ? "yellow" : "rose"} className="tabular-nums">
                      {courier.ratio}%
                    </Chip>
                  </span>
                </li>
              ))}
            </ul>
            {hiddenCourierCount > 0 && (
              <p className="mt-2 text-[11px] tabular-nums text-black/40">+{hiddenCourierCount} more couriers with no parcels</p>
            )}
          </div>

          {hasReviews && (
            <div className="min-w-0">
              <p className="text-[8px] font-medium uppercase tracking-[0.2em] text-black/55">Reviews from other merchants</p>
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

      {(failed || !hasData || showDetails) && (
        <div className="mt-3 flex items-center justify-end gap-1.5">
          {!showRiskRow && data?.checkedAt && <span className="text-[11px] tabular-nums text-black/65">{relativeAge(data.checkedAt)}</span>}

          {failed || (quotaBlocked && !hasData) ? (
            <button
              type="button"
              aria-label="Retry"
              disabled={busy}
              onClick={() => check.mutate({ force: true })}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-black/[0.04] px-2.5 text-black transition hover:bg-black/[0.08] disabled:opacity-40"
            >
              <RefreshIcon size={18} />
              Retry
            </button>
          ) : !hasData ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => check.mutate({ force: false })}
              className="inline-flex h-7 items-center rounded-lg bg-black px-3 text-[12px] font-medium text-white transition hover:bg-black/90 disabled:opacity-40"
            >
              Check
            </button>
          ) : !showRiskRow ? (
            <button
              type="button"
              aria-label="Re-check"
              disabled={busy}
              onClick={() => check.mutate({ force: true })}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-black/[0.04] px-2.5 text-black transition hover:bg-black/[0.08] disabled:opacity-40"
            >
              <RefreshIcon size={18} />
            </button>
          ) : null}

          {showDetails && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex h-6 items-center gap-1 rounded-md bg-black/[0.04] px-2 py-1 text-[12px] font-medium text-black transition hover:bg-black/[0.08]"
            >
              Details
              <CaretDown weight="light" size={12} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
