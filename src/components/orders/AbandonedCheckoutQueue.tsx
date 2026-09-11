import { useState } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  Check,
  ClipboardText,
  Copy,
  Pencil,
  Phone,
  Trash,
  WhatsappLogo,
} from "@phosphor-icons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/ios-spinner";
import {
  abandonedCheckoutCartSummary,
  abandonedCheckoutCopySummary,
  abandonedCheckoutSourceLabel,
  abandonedCheckoutTelHref,
  abandonedCheckoutWhatsAppHref,
  type AbandonedCheckout,
} from "@/lib/abandonedCheckouts";
import { cn } from "@/lib/utils";

type AbandonedCheckoutAction = "contacted" | "dismissed";

export type AbandonedCheckoutQueueProps = {
  checkouts: AbandonedCheckout[];
  loading: boolean;
  error: string | null;
  actionInFlightId: string | null;
  onAction: (checkoutId: string, action: AbandonedCheckoutAction) => void | Promise<void>;
  onEdit?: (checkout: AbandonedCheckout) => void;
  onConvert?: (checkout: AbandonedCheckout, status: "pending" | "on_hold" | "approved") => void;
  onRetry?: () => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAll?: () => void;
  onOpenCheckout?: (id: string) => void;
};

function formatEstimatedTotal(total: number | null) {
  return typeof total === "number" && Number.isFinite(total)
    ? `৳${total.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`
    : "—";
}

function captureTime(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? "Captured recently" : `Captured ${format(date, "d MMM, h:mm a")}`;
}

export function AbandonedCheckoutQueue({
  checkouts,
  loading,
  error,
  actionInFlightId,
  onAction,
  onEdit = () => {},
  onConvert = () => {},
  onRetry,
  selectedIds = new Set(),
  onToggleSelect = () => {},
  onSelectAll = () => {},
  onOpenCheckout = () => {},
}: AbandonedCheckoutQueueProps) {
  const [dismissTarget, setDismissTarget] = useState<AbandonedCheckout | null>(null);
  const [copyStatus, setCopyStatus] = useState("");

  const copySummary = async (checkout: AbandonedCheckout) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(abandonedCheckoutCopySummary(checkout));
      setCopyStatus("Checkout summary copied");
    } catch {
      setCopyStatus("Could not copy checkout summary");
    }
  };

  const copyField = async (value: string, label: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label} copied`);
    } catch {
      setCopyStatus(`Could not copy ${label.toLowerCase()}`);
    }
  };

  const dismiss = () => {
    if (!dismissTarget) return;
    const checkoutId = dismissTarget.id;
    setDismissTarget(null);
    void onAction(checkoutId, "dismissed");
  };

  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center gap-2 px-6 py-12 text-sm text-black/45" role="status">
        <Spinner size="sm" className="text-black/55" />
        Loading abandoned checkouts…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <p className="text-sm text-black/60">{error}</p>
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
        <p className="text-sm font-medium text-black/75">No active abandoned checkouts</p>
        <p className="mt-1 text-xs text-black/45">New checkout drafts with a valid phone number will appear here.</p>
      </div>
    );
  }

  const allSelected = checkouts.length > 0 && checkouts.every((checkout) => selectedIds.has(checkout.id));

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 sm:px-6">
        <div
          data-testid="checkbox-abandoned-all"
          role="checkbox"
          aria-checked={allSelected}
          aria-label="Select all checkouts"
          tabIndex={0}
          onClick={() => onSelectAll()}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onSelectAll();
          }}
          className={cn(
            "w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center cursor-pointer transition-all duration-200",
            allSelected
              ? "bg-[#0285F7] border-[#0285F7] scale-105 shadow-sm"
              : "border-black/20 bg-white hover:border-black/40 active:scale-95"
          )}
        >
          {allSelected && (
            <motion.svg
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              viewBox="0 0 12 12"
              className="w-3 h-3"
              fill="none"
            >
              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </motion.svg>
          )}
        </div>
        <span className="text-xs text-black/45">{selectedIds.size} selected</span>
      </div>
      <div className="divide-y divide-black/[0.08]" data-testid="abandoned-checkout-queue">
        {checkouts.map((checkout) => {
          const callHref = abandonedCheckoutTelHref(checkout.phone);
          const whatsAppHref = abandonedCheckoutWhatsAppHref(checkout.phone);
          const isUpdating = actionInFlightId === checkout.id;
          const isNew = checkout.status === "open";
          const selected = selectedIds.has(checkout.id);

          return (
            <article
              key={checkout.id}
              tabIndex={0}
              onClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("button, a, input, textarea, select, [role='button'], [role='checkbox'], [data-row-interactive='true']")) return;
                onOpenCheckout(checkout.id);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                const target = event.target as HTMLElement;
                if (target.closest("button, a, input, textarea, select, [role='button'], [role='checkbox'], [data-row-interactive='true']")) return;
                event.preventDefault();
                onOpenCheckout(checkout.id);
              }}
              className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center"
            >
              <div
                data-testid={`checkbox-abandoned-${checkout.id}`}
                role="checkbox"
                aria-checked={selected}
                aria-label={checkout.customer_name ? `Select checkout for ${checkout.customer_name}` : checkout.phone ? `Select checkout for ${checkout.phone}` : "Select checkout"}
                tabIndex={0}
                onClick={() => onToggleSelect(checkout.id)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onToggleSelect(checkout.id);
                }}
                className={cn(
                  "w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center cursor-pointer transition-all duration-200 mt-1",
                  selected
                    ? "bg-[#0285F7] border-[#0285F7] scale-105 shadow-sm"
                    : "border-black/20 bg-white hover:border-black/40 active:scale-95"
                )}
              >
                {selected && (
                  <motion.svg
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    viewBox="0 0 12 12"
                    className="w-3 h-3"
                    fill="none"
                  >
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </motion.svg>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-medium text-black">{checkout.customer_name || "Customer name not provided"}</p>
                  <span className={isNew
                    ? "rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-rose-600"
                    : "rounded-full bg-black/[0.05] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-black/55"}
                  >
                    {isNew ? "New" : "Contacted"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-black/45">
                  <span>{abandonedCheckoutSourceLabel(checkout.source)}</span>
                  <span aria-hidden>·</span>
                  <span>{captureTime(checkout.created_at)}</span>
                  <span aria-hidden>·</span>
                  <span className="font-medium tabular-nums text-black/70">{formatEstimatedTotal(checkout.total)}</span>
                </div>
                <p className="mt-3 text-xs leading-5 text-black/70">{abandonedCheckoutCartSummary(checkout.cart)}</p>
                {checkout.phone && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-black/70">
                    <span className="tabular-nums">{checkout.phone}</span>
                    <button
                      type="button"
                      aria-label="Copy phone number"
                      onClick={() => {
                        if (checkout.phone) void copyField(checkout.phone, "Phone number");
                      }}
                      className="inline-flex items-center rounded-md p-1 text-black/40 transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                    >
                      <Copy size={13} weight="light" aria-hidden />
                    </button>
                  </p>
                )}
                {checkout.address && (
                  <p className="mt-1 text-xs leading-5 text-black/45">
                    {checkout.address}{" "}
                    <button
                      type="button"
                      aria-label="Copy address"
                      onClick={() => {
                        if (checkout.address) void copyField(checkout.address, "Address");
                      }}
                      className="inline-flex items-center rounded-md p-1 align-middle text-black/40 transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                    >
                      <Copy size={13} weight="light" aria-hidden />
                    </button>
                  </p>
                )}
              </div>

              <div className="col-start-2 flex flex-wrap items-center gap-1.5 lg:col-start-3 lg:justify-end">
                {callHref ? (
                  <a
                    href={callHref}
                    aria-label={`Call ${checkout.phone}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-black/70 transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                  >
                    <Phone size={15} weight="light" aria-hidden />
                    Call
                  </a>
                ) : null}
                {whatsAppHref ? (
                  <a
                    href={whatsAppHref}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open WhatsApp for ${checkout.phone}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-black/70 transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                  >
                    <WhatsappLogo size={15} weight="light" aria-hidden />
                    WhatsApp
                  </a>
                ) : null}
                <button
                  type="button"
                  aria-label="Copy checkout summary"
                  onClick={() => void copySummary(checkout)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-black/70 transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                >
                  <ClipboardText size={15} weight="light" aria-hidden />
                  Copy
                </button>
                {isNew && (
                  <button
                    type="button"
                    aria-label="Mark as contacted"
                    disabled={isUpdating}
                    onClick={() => void onAction(checkout.id, "contacted")}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-black/70 transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 disabled:cursor-wait disabled:opacity-45"
                  >
                    {isUpdating ? <Spinner size="sm" /> : <Check size={15} weight="light" aria-hidden />}
                    Contacted
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Edit checkout"
                  onClick={() => onEdit(checkout)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-black/70 transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                >
                  <Pencil size={15} weight="light" aria-hidden />
                  Edit
                </button>
                <button
                  type="button"
                  aria-label="Move to pending"
                  onClick={() => onConvert(checkout, "pending")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-black/70 transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                >
                  Pending
                </button>
                <button
                  type="button"
                  aria-label="Move to on hold"
                  onClick={() => onConvert(checkout, "on_hold")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-black/70 transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                >
                  On Hold
                </button>
                <button
                  type="button"
                  aria-label="Move to approved"
                  onClick={() => onConvert(checkout, "approved")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-black/70 transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                >
                  Approved
                </button>
                <button
                  type="button"
                  aria-label="Dismiss checkout"
                  disabled={isUpdating}
                  onClick={() => setDismissTarget(checkout)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 disabled:cursor-wait disabled:opacity-45"
                >
                  <Trash size={15} weight="light" aria-hidden />
                  Dismiss
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <p className="sr-only" aria-live="polite">{copyStatus}</p>

      <AlertDialog open={Boolean(dismissTarget)} onOpenChange={(open) => !open && setDismissTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss checkout?</AlertDialogTitle>
            <AlertDialogDescription>Dismiss this checkout from the recovery queue? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep checkout</AlertDialogCancel>
            <AlertDialogAction
              onClick={dismiss}
              aria-label="Confirm dismiss"
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Dismiss checkout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
