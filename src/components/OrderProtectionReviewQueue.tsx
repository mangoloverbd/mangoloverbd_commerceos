import { useCallback, useEffect, useState } from "react";
import { Check, ShieldCheck, X } from "@phosphor-icons/react";
import {
  fetchProtectionReviews,
  updateProtectionReview,
  type ProtectionReview,
} from "@/lib/orderProtection";
import { Chip } from "@/components/base/badges/chip";
import { Spinner } from "@/components/ui/ios-spinner";
import { cn } from "@/lib/utils";

/** Same Board UI chip recipe the abandoned-checkout row actions use. */
const actionChip =
  "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-caption-1-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-wait disabled:opacity-45";
const actionChipApprove =
  "bg-status-lime-background text-status-lime-text hover:bg-status-lime-background/80 focus-visible:ring-black/30";
const actionChipReject =
  "bg-background-secondary-default text-text-secondary hover:bg-background-secondary-hover hover:text-text-primary focus-visible:ring-black/30";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
export function OrderProtectionReviewQueue() {
  const [reviews, setReviews] = useState<ProtectionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchProtectionReviews();
      setReviews(response.reviews);
    } catch {
      setError("Could not load held orders. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const handleAction = async (reviewId: string, action: "approve" | "reject") => {
    setBusyId(reviewId);
    setError("");
    try {
      await updateProtectionReview(reviewId, action);
      setReviews((current) => current.filter((review) => review.id !== reviewId));
    } catch {
      setError(action === "approve"
        ? "This order could not be approved. Stock or catalog details may have changed."
        : "This order could not be rejected. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const header = (
    <div className="flex items-center gap-2.5 py-3">
      <span className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Review Queue</span>
      <div className="h-3.5 w-px bg-black/10" />
      <span className="text-[13px] tabular-nums text-muted-foreground">
        {loading ? "—" : `${reviews.length} ${reviews.length === 1 ? "order" : "orders"}`}
      </span>
    </div>
  );

  if (loading) {
    return (
      <>
        {header}
        <div className="flex min-h-48 items-center justify-center gap-2 border-t border-black/[0.07] px-6 py-12 text-sm text-black/45" role="status">
          <Spinner size="sm" className="text-black/55" />
          Loading held orders…
        </div>
      </>
    );
  }

  if (error && reviews.length === 0) {
    return (
      <>
        {header}
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 border-t border-black/[0.07] px-6 py-12 text-center">
          <p role="alert" className="text-sm text-black/60">{error}</p>
          <button
            type="button"
            onClick={() => void loadReviews()}
            className="rounded-lg px-3 py-2 text-xs font-medium text-black transition-colors hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
          >
            Try again
          </button>
        </div>
      </>
    );
  }

  if (reviews.length === 0) {
    return (
      <>
        {header}
        <div className="flex min-h-48 flex-col items-center justify-center border-t border-black/[0.07] px-6 py-12 text-center">
          <p className="text-sm font-medium text-black/75">No orders are waiting for review</p>
          <p className="mt-1 text-xs text-black/45">Held storefront orders appear here before stock, SMS, or courier actions run.</p>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      {error && (
        <p role="alert" className="border-t border-black/[0.07] py-3 text-sm text-red-700">{error}</p>
      )}
      <div className="divide-y divide-black/[0.08] border-t border-black/[0.07]">
      {reviews.map((review) => (
        <article key={review.id} className="px-1 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <ShieldCheck weight="light" size={18} aria-hidden="true" className="text-black/50" />
                <p className="text-sm font-medium text-black">{review.customer_name || "Unnamed customer"}</p>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                  On hold
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-black/45">
                <Chip variant="subtle" color="gray" className="tabular-nums">{review.phone || "No phone"}</Chip>
                <span>{formatDate(review.created_at)}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/45">Risk score</p>
              <p className="mt-1 text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{review.score}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/45">Delivery address</p>
              <p className="mt-1 text-xs leading-5 text-black/70">{review.address || "Not provided"}</p>
            </div>
            <div>
              <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/45">Risk reasons</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {review.reason_codes.map((reason) => (
                  <Chip key={reason} variant="caption" color="rose">{reason}</Chip>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/45">Cart</p>
            <ul className="mt-1 space-y-1 text-xs leading-5 text-black/70">
              {review.items.map((item, index) => (
                <li key={`${review.id}-${index}`}>{String(item.productName || item.product_name || "Product")} × {String(item.quantity || 1)}</li>
              ))}
            </ul>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-label={`Approve order for ${review.customer_name || "unnamed customer"}`}
              className={cn(actionChip, actionChipApprove)}
              disabled={busyId === review.id}
              onClick={() => void handleAction(review.id, "approve")}
            >
              {busyId === review.id ? <Spinner size="sm" /> : <Check weight="light" size={13} aria-hidden="true" />}
              Approve
            </button>
            <button
              type="button"
              aria-label={`Reject order for ${review.customer_name || "unnamed customer"}`}
              className={cn(actionChip, actionChipReject)}
              disabled={busyId === review.id}
              onClick={() => void handleAction(review.id, "reject")}
            >
              <X weight="light" size={13} aria-hidden="true" />
              Reject
            </button>
          </div>
        </article>
      ))}
      </div>
    </>
  );
}
