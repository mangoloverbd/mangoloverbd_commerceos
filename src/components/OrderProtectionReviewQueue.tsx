import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  CaretDown,
  Check,
  Copy,
  Phone,
  ShieldCheck,
  WhatsappLogo,
  X,
} from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Chip } from "@/components/base/badges/chip";
import { Spinner } from "@/components/ui/ios-spinner";
import {
  fetchProtectionReviews,
  updateProtectionReview,
  type ProtectionReview,
} from "@/lib/orderProtection";
import {
  calculateProtectionTotal,
  formatProtectionItemLabel,
  formatProtectionLinePrice,
  formatProtectionTotal,
  protectionCopySummary,
  protectionReasonLabel,
  protectionSourceLabel,
  protectionTelHref,
  protectionWhatsAppHref,
} from "@/lib/orderProtectionDisplay";
import { cn } from "@/lib/utils";
import { isVisibleRiskSignal } from "@/lib/orderRisk";
import { useQueryClient } from "@tanstack/react-query";
import { refreshNavCounts } from "@/hooks/useNavCounts";

type ContactStatus = "open" | "contacted";

const actionChip =
  "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-caption-1-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-wait disabled:opacity-45";
const actionChipNeutral =
  "bg-background-secondary-default text-black hover:bg-background-secondary-hover hover:text-black focus-visible:ring-black/30";
const actionChipApprove =
  "bg-status-lime-background text-black hover:bg-status-lime-background/80 focus-visible:ring-black/30";

const CONTACT_STATUS_OPTIONS = [
  { value: "open", label: "Awaiting contact", dotClassName: "bg-rose-400" },
  { value: "contacted", label: "Contacted", dotClassName: "bg-lime-500" },
] as const;

function CopyGlyph({ copied, size = 13 }: { copied: boolean; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden>
      <span
        className={cn(
          "absolute inset-0 inline-flex items-center justify-center transition-all duration-200 ease-out motion-reduce:transition-none",
          copied ? "scale-0 opacity-0 blur-[2px]" : "scale-100 opacity-100 blur-none",
        )}
      >
        <Copy size={size} weight="light" />
      </span>
      <span
        className={cn(
          "absolute inset-0 inline-flex items-center justify-center text-status-lime-text transition-all duration-200 ease-out motion-reduce:transition-none",
          copied ? "scale-100 opacity-100 blur-none" : "scale-[0.7] opacity-0 blur-[2px]",
        )}
      >
        <Check size={size} weight="bold" />
      </span>
    </span>
  );
}

function captureTime(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? "Captured recently" : `Captured ${format(date, "d MMM, h:mm a")}`;
}

export function OrderProtectionReviewQueue() {
  const [reviews, setReviews] = useState<ProtectionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contactStatus, setContactStatus] = useState<Record<string, ContactStatus>>({});
  const [openStatusMenuId, setOpenStatusMenuId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchProtectionReviews();
      setReviews(response.reviews);
      setContactStatus(response.reviews.reduce<Record<string, ContactStatus>>((current, review) => ({
        ...current,
        [review.id]: review.contact_status === "contacted" ? "contacted" : "open",
      }), {}));
    } catch {
      setError("Could not load held orders. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReviews();
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, [loadReviews]);

  const markCopied = (key: string) => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    setCopiedKey(key);
    copiedTimer.current = setTimeout(() => setCopiedKey(null), 1600);
  };

  const copyValue = async (value: string, label: string, key: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label} copied`);
      markCopied(key);
    } catch {
      setCopyStatus(`Could not copy ${label.toLowerCase()}`);
    }
  };

  const handleAction = async (reviewId: string, action: "approve" | "reject", rejectReason?: "fake" | "other") => {
    setBusyId(reviewId);
    setError("");
    try {
      if (rejectReason) await updateProtectionReview(reviewId, action, rejectReason);
      else await updateProtectionReview(reviewId, action);
      setReviews((current) => current.filter((review) => review.id !== reviewId));
      void refreshNavCounts(queryClient);
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(reviewId);
        return next;
      });
    } catch {
      setError(action === "approve"
        ? "This order could not be approved. Stock or catalog details may have changed."
        : "This order could not be rejected. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const handleContactStatus = async (reviewId: string, nextStatus: ContactStatus) => {
    const previousStatus = contactStatus[reviewId] || "open";
    setContactStatus((current) => ({ ...current, [reviewId]: nextStatus }));
    setOpenStatusMenuId(null);
    setBusyId(reviewId);
    setError("");
    try {
      await updateProtectionReview(reviewId, nextStatus);
    } catch {
      setContactStatus((current) => ({ ...current, [reviewId]: previousStatus }));
      setError("This contact status could not be saved. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleSelected = (reviewId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(reviewId)) next.delete(reviewId);
      else next.add(reviewId);
      return next;
    });
  };

  const allSelected = reviews.length > 0 && reviews.every((review) => selectedIds.has(review.id));
  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(reviews.map((review) => review.id)));
  };

  const header = (
    <>
      <div className="flex items-center gap-2.5 py-3">
        <span className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Review Queue</span>
        <div className="h-3.5 w-px bg-black/10" />
        <span className="text-[13px] tabular-nums text-muted-foreground">
          {loading ? "—" : `${reviews.length} ${reviews.length === 1 ? "order" : "orders"}`}
        </span>
      </div>
      {!loading && reviews.length > 0 && (
        <div className="flex items-center gap-2 border-t border-black/[0.07] px-2 py-2 sm:px-3">
          <div
            data-testid="checkbox-protection-all"
            role="checkbox"
            aria-checked={allSelected}
            aria-label="Select all reviews"
            tabIndex={0}
            onClick={toggleAll}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              toggleAll();
            }}
            className={cn(
              "flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-[5px] border-[1.5px] transition-all duration-200",
              allSelected
                ? "border-[#0285F7] bg-[#0285F7] shadow-sm"
                : "border-black/20 bg-white hover:border-black/40 active:scale-95",
            )}
          >
            {allSelected && (
              <motion.svg
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                viewBox="0 0 12 12"
                className="h-3 w-3"
                fill="none"
                aria-hidden
              >
                <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </motion.svg>
            )}
          </div>
          <span className="text-xs text-black">{selectedIds.size} selected</span>
        </div>
      )}
    </>
  );

  if (loading) {
    return (
      <>
        {header}
        <div className="flex min-h-48 items-center justify-center gap-2 border-t border-black/[0.07] px-6 py-12 text-sm text-black" role="status">
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
          <p role="alert" className="text-sm text-black">{error}</p>
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
          <p className="text-sm font-medium text-black">No orders are waiting for review</p>
          <p className="mt-1 text-xs text-black">Held storefront orders appear here before stock, SMS, or courier actions run.</p>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      {error && <p role="alert" className="border-t border-black/[0.07] py-3 text-sm text-red-700">{error}</p>}
      <div className="space-y-2 border-t border-black/[0.07] bg-[#f5f5f5] p-2 sm:p-3" data-testid="order-protection-queue">
        {reviews.map((review) => {
          const callHref = protectionTelHref(review.phone);
          const whatsAppHref = protectionWhatsAppHref(review.phone);
          const isUpdating = busyId === review.id;
          const selected = selectedIds.has(review.id);
          const status = contactStatus[review.id] || "open";
          const total = calculateProtectionTotal(review.items);

          return (
            <article
              key={review.id}
              className="bg-white px-3 py-4 sm:px-4"
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
                <div
                  data-testid={`checkbox-protection-${review.id}`}
                  role="checkbox"
                  aria-checked={selected}
                  aria-label={review.customer_name ? `Select review for ${review.customer_name}` : "Select review"}
                  tabIndex={0}
                  onClick={() => toggleSelected(review.id)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    toggleSelected(review.id);
                  }}
                  className={cn(
                    "mt-1 flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-[5px] border-[1.5px] transition-all duration-200",
                    selected
                      ? "border-[#0285F7] bg-[#0285F7] shadow-sm"
                      : "border-black/20 bg-white hover:border-black/40 active:scale-95",
                  )}
                >
                  {selected && (
                    <motion.svg
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                      viewBox="0 0 12 12"
                      className="h-3 w-3"
                      fill="none"
                      aria-hidden
                    >
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </motion.svg>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <ShieldCheck weight="light" size={18} aria-hidden="true" className="text-black" />
                        <p className="text-sm font-medium text-black">{review.customer_name || "Customer name not provided"}</p>
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-700">On hold</span>
                      </div>
                      <p className="mt-1 flex flex-wrap gap-x-1.5 text-[11px] text-black/60">
                        <span>{protectionSourceLabel(review.source_route)}</span>
                        <span aria-hidden>·</span>
                        <span>{captureTime(review.created_at)}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <span data-testid={`protection-total-${review.id}`} className="text-sm font-medium tabular-nums text-black">{formatProtectionTotal(total)}</span>
                      <Chip variant="caption" color="yellow" className="gap-1 tabular-nums">
                        <span>Risk score</span>
                        <strong className="font-medium">{review.score}</strong>
                      </Chip>
                    </div>
                  </div>

                  <ul className="mt-4 space-y-1.5 text-sm text-black">
                    {review.items.length > 0 ? review.items.map((item, index) => {
                      const linePrice = formatProtectionLinePrice(item);
                      return (
                        <li
                          key={`${review.id}-item-${index}`}
                          data-testid={`protection-product-${review.id}-${index}`}
                          className="flex items-baseline justify-between gap-4"
                        >
                          <span className="min-w-0">{formatProtectionItemLabel(item)}</span>
                          {linePrice && <span className="shrink-0 tabular-nums">{linePrice}</span>}
                        </li>
                      );
                    }) : <li className="text-xs text-black/60">No cart details</li>}
                  </ul>

                  <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-black">
                    {review.phone && (
                      <span className="flex items-center gap-1 tabular-nums">
                        {review.phone}
                        <button
                          type="button"
                          aria-label="Copy phone number"
                          onClick={() => void copyValue(review.phone || "", "Phone number", `${review.id}:phone`)}
                          className="inline-flex items-center rounded-md p-1 text-black transition-all duration-200 ease-out hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                        >
                          <CopyGlyph copied={copiedKey === `${review.id}:phone`} />
                        </button>
                      </span>
                    )}
                    <span className="flex min-w-0 items-center gap-1">
                      <span>{review.address || "Address not provided"}</span>
                      {review.address && (
                        <button
                          type="button"
                          aria-label="Copy address"
                          onClick={() => void copyValue(review.address || "", "Address", `${review.id}:address`)}
                          className="inline-flex shrink-0 items-center rounded-md p-1 text-black transition-all duration-200 ease-out hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                        >
                          <CopyGlyph copied={copiedKey === `${review.id}:address`} />
                        </button>
                      )}
                    </span>
                  </div>

                  <div data-testid={`risk-reasons-${review.id}`} className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="shrink-0 text-[8px] font-medium uppercase tracking-[0.3em] text-black">Why held</span>
                    {review.reason_codes.some(isVisibleRiskSignal) ? review.reason_codes.filter(isVisibleRiskSignal).map((reason) => (
                      <Chip key={reason} variant="caption" color="rose">{protectionReasonLabel(reason, review.reason_labels)}</Chip>
                    )) : <span className="text-xs text-black">None</span>}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 border-t border-black/[0.07] pt-3 sm:ml-[30px] lg:flex-row lg:items-center lg:justify-between">
                <div data-testid={`protection-contact-actions-${review.id}`} className="flex flex-wrap items-center gap-1.5">
                  {callHref ? (
                    <a href={callHref} aria-label={`Call ${review.phone}`} className={cn(actionChip, actionChipNeutral)}>
                      <Phone size={13} weight="light" aria-hidden />
                      Call
                    </a>
                  ) : null}
                  {whatsAppHref ? (
                    <a
                      href={whatsAppHref}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open WhatsApp for ${review.phone}`}
                      className={cn(actionChip, actionChipNeutral)}
                    >
                      <WhatsappLogo size={13} weight="light" aria-hidden />
                      WhatsApp
                    </a>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Copy review summary"
                    onClick={() => void copyValue(protectionCopySummary(review), "Review summary", `${review.id}:summary`)}
                    className={cn(actionChip, actionChipNeutral)}
                  >
                    <CopyGlyph copied={copiedKey === `${review.id}:summary`} />
                    {copiedKey === `${review.id}:summary` ? "Copied" : "Copy summary"}
                  </button>
                  <DropdownMenu
                    open={openStatusMenuId === review.id}
                    onOpenChange={(open) => setOpenStatusMenuId(open ? review.id : null)}
                  >
                    <DropdownMenuTrigger
                      aria-label={`Contact status: ${status === "open" ? "Awaiting contact" : "Contacted"}`}
                      disabled={isUpdating}
                      className={cn(actionChip, "w-[10.5rem] justify-start", status === "open" ? actionChipNeutral : actionChipApprove)}
                    >
                      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", status === "open" ? "bg-rose-400" : "bg-lime-500")} />
                      {status === "open" ? "Awaiting contact" : "Contacted"}
                      <CaretDown size={11} weight="light" aria-hidden className="ml-auto shrink-0 opacity-60" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={6} className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-0">
                      <DropdownMenuLabel className="px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-black">Mark as</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={status}
                        onValueChange={(value) => {
                          if (value === "open" || value === "contacted") {
                            void handleContactStatus(review.id, value);
                          }
                        }}
                      >
                        {CONTACT_STATUS_OPTIONS.map((option) => (
                          <DropdownMenuRadioItem
                            key={option.value}
                            value={option.value}
                            className="gap-2 whitespace-nowrap px-2 text-[12px] font-medium [&>span:first-child]:hidden"
                          >
                            <span aria-hidden className="flex h-3 w-1.5 shrink-0 items-center justify-center">
                              {option.value === status
                                ? <Check size={12} weight="bold" />
                                : <span className={cn("h-1.5 w-1.5 rounded-full", option.dotClassName)} />}
                            </span>
                            {option.label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div data-testid={`protection-decision-actions-${review.id}`} className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                  <button type="button" className={cn(actionChip, actionChipNeutral)} disabled={isUpdating} onClick={() => void handleAction(review.id, "reject", "fake")}>Reject as fake</button>
                  <button
                    type="button"
                    aria-label={`Reject order for ${review.customer_name || "unnamed customer"}`}
                    className={cn(actionChip, actionChipNeutral)}
                    disabled={isUpdating}
                    onClick={() => void handleAction(review.id, "reject")}
                  >
                    <X weight="light" size={13} aria-hidden="true" />
                    Reject
                  </button>
                  <button
                    type="button"
                    aria-label={`Approve order for ${review.customer_name || "unnamed customer"}`}
                    className={cn(actionChip, actionChipApprove)}
                    disabled={isUpdating}
                    onClick={() => void handleAction(review.id, "approve")}
                  >
                    {isUpdating ? <Spinner size="sm" /> : <Check weight="light" size={13} aria-hidden="true" />}
                    Accept
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <p className="sr-only" aria-live="polite">{copyStatus}</p>

    </>
  );
}
