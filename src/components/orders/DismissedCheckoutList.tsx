import { useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, Plus } from "@phosphor-icons/react";
import { Chip } from "@/components/base/badges/chip";
import { Spinner } from "@/components/ui/ios-spinner";
import { CopyGlyph } from "@/components/orders/AbandonedCheckoutQueue";
import {
  abandonedCheckoutCartSummary,
  abandonedCheckoutSourceLabel,
  dismissedCheckoutLabel,
  formatAbandonedCheckoutCaptureTime,
  formatAbandonedCheckoutTotal,
  isRestorableDismissedCheckout,
  type DismissedAbandonedCheckout,
} from "@/lib/abandonedCheckouts";
import { cn } from "@/lib/utils";

export type DismissedCheckoutListProps = {
  checkouts: DismissedAbandonedCheckout[];
  loading: boolean;
  error: string | null;
  /** Staff search text; changes the empty-state copy. */
  searching: boolean;
  actionInFlightId: string | null;
  onRestore: (checkoutId: string) => void | Promise<void>;
  onCreateOrder: (checkoutId: string) => void | Promise<void>;
  onRetry?: () => void;
  /**
   * Shown under the Active results while searching: a small "Dismissed"
   * heading, and nothing at all while loading, failing or empty.
   */
  inline?: boolean;
};

const actionButton =
  "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-caption-1-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-wait disabled:opacity-45";

export function DismissedCheckoutList({
  checkouts,
  loading,
  error,
  searching,
  actionInFlightId,
  onRestore,
  onCreateOrder,
  onRetry,
  inline = false,
}: DismissedCheckoutListProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const copyPhone = async (checkout: DismissedAbandonedCheckout) => {
    if (!checkout.phone) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(checkout.phone);
      setCopyStatus("Phone number copied");
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      setCopiedKey(checkout.id);
      copiedTimer.current = setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      setCopyStatus("Could not copy phone number");
    }
  };

  if (inline && (loading || error || checkouts.length === 0)) return null;

  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center gap-2 px-6 py-12 text-sm text-black" role="status">
        <Spinner size="sm" className="text-black" />
        Loading dismissed checkouts…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <p className="text-sm text-black">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg px-3 py-2 text-xs font-medium text-black transition-colors hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (!checkouts.length) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-sm font-medium text-black">
          {searching ? "No dismissed checkouts match this search" : "No dismissed checkouts in the last 30 days"}
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Dismissed checkouts" className={cn(inline && "border-t border-black/10")}>
      {inline && (
        <h3 className="px-4 pb-1 pt-4 text-[8px] font-medium uppercase tracking-[0.3em] text-black sm:px-6">
          Dismissed
        </h3>
      )}
      <div className="divide-y divide-black/[0.08]" data-testid={inline ? "dismissed-checkout-matches" : "dismissed-checkout-list"}>
        {checkouts.map((checkout) => {
          const busy = actionInFlightId === checkout.id;
          const restorable = isRestorableDismissedCheckout(checkout);
          return (
            <article
              key={checkout.id}
              data-dismissed-checkout={checkout.id}
              className="grid gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-medium text-black">{checkout.customer_name || "Customer name not provided"}</p>
                  <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10.5px] font-medium text-black/70">
                    {dismissedCheckoutLabel(checkout)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-black">
                  <span>{abandonedCheckoutSourceLabel(checkout.source, checkout.cart)}</span>
                  <span aria-hidden>·</span>
                  <span>{formatAbandonedCheckoutCaptureTime(checkout.created_at)}</span>
                  <Chip variant="subtle" color="gray" className="tabular-nums">
                    {formatAbandonedCheckoutTotal(checkout.total)}
                  </Chip>
                </div>
                <p className="mt-3 text-xs leading-5 text-black">{abandonedCheckoutCartSummary(checkout.cart)}</p>
                {checkout.phone && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-black">
                    <Chip variant="subtle" color="gray" className="tabular-nums">{checkout.phone}</Chip>
                    <button
                      type="button"
                      aria-label="Copy phone number"
                      onClick={() => void copyPhone(checkout)}
                      className="inline-flex items-center rounded-md p-1 text-black transition-all duration-200 ease-out active:scale-[0.97] hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                    >
                      <CopyGlyph copied={copiedKey === checkout.id} />
                    </button>
                  </p>
                )}
                {checkout.address && <p className="mt-1 text-xs leading-5 text-black">{checkout.address}</p>}
              </div>

              {restorable && (
                <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                  <button
                    type="button"
                    aria-label={`Restore checkout${checkout.customer_name ? ` for ${checkout.customer_name}` : ""}`}
                    disabled={busy}
                    onClick={() => void onRestore(checkout.id)}
                    className={cn(actionButton, "bg-background-secondary-default text-black hover:bg-background-secondary-hover focus-visible:ring-black/30")}
                  >
                    {busy ? <Spinner size="sm" /> : <ArrowCounterClockwise size={13} weight="light" aria-hidden />}
                    Restore
                  </button>
                  <button
                    type="button"
                    aria-label={`Create order${checkout.customer_name ? ` for ${checkout.customer_name}` : ""}`}
                    disabled={busy}
                    onClick={() => void onCreateOrder(checkout.id)}
                    className={cn(actionButton, "bg-black text-white hover:bg-black/85 focus-visible:ring-black/40")}
                  >
                    <Plus size={13} weight="light" aria-hidden />
                    Create order
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">{copyStatus}</p>
    </section>
  );
}
