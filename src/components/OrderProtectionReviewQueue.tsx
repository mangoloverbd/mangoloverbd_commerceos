import { useCallback, useEffect, useState } from "react";
import { Check, ShieldCheck, X } from "@phosphor-icons/react";
import {
  fetchProtectionReviews,
  updateProtectionReview,
  type ProtectionReview,
} from "@/lib/orderProtection";

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

  if (loading) return <p className="text-sm text-muted-foreground">Loading held orders…</p>;
  if (error && reviews.length === 0) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (reviews.length === 0) return <p className="text-sm text-muted-foreground">No orders are waiting for review.</p>;

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {reviews.map((review) => (
        <article key={review.id} className="border-b border-black/10 pb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck weight="light" size={20} aria-hidden="true" />
                <h2 className="text-lg font-light">{review.customer_name || "Unnamed customer"}</h2>
                <span className="text-[8px] font-medium uppercase tracking-[0.3em] text-amber-700">On hold</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{review.phone || "No phone"} · {formatDate(review.created_at)}</p>
            </div>
            <div className="text-right">
              <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-muted-foreground">Risk score</p>
              <p className="text-3xl font-light">{review.score}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-muted-foreground">Delivery address</p>
              <p className="mt-1 text-sm">{review.address || "Not provided"}</p>
            </div>
            <div>
              <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-muted-foreground">Risk reasons</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {review.reason_codes.map((reason) => (
                  <span key={reason} className="border border-black/15 px-2 py-1 text-[10px]">{reason}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-muted-foreground">Cart</p>
            <ul className="mt-1 space-y-1 text-sm">
              {review.items.map((item, index) => (
                <li key={`${review.id}-${index}`}>{String(item.productName || item.product_name || "Product")} × {String(item.quantity || 1)}</li>
              ))}
            </ul>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 bg-black px-4 py-2 text-xs text-white disabled:opacity-50"
              disabled={busyId === review.id}
              onClick={() => void handleAction(review.id, "approve")}
            >
              <Check weight="light" size={16} aria-hidden="true" /> Approve
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 border border-black/20 px-4 py-2 text-xs disabled:opacity-50"
              disabled={busyId === review.id}
              onClick={() => void handleAction(review.id, "reject")}
            >
              <X weight="light" size={16} aria-hidden="true" /> Reject
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
