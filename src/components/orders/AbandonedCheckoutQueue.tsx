import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  CaretDown,
  Check,
  Copy,
  Phone,
  Trash,
  WhatsappLogo,
} from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Chip } from "@/components/base/badges/chip";
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

type AbandonedCheckoutAction = "contacted" | "dismissed" | "open";

/**
 * Contact-status vocabulary. The pending state is named for what it is rather
 * than what it is not, so the menu never asks staff to pick a negation.
 */
const ABANDONED_STATUS_LABEL = {
  open: "Awaiting contact",
  contacted: "Contacted",
} as const;

const ABANDONED_STATUS_OPTIONS = [
  { value: "open", label: ABANDONED_STATUS_LABEL.open, dotClassName: "bg-rose-400" },
  { value: "contacted", label: ABANDONED_STATUS_LABEL.contacted, dotClassName: "bg-lime-500" },
] as const;

/**
 * Board UI chip recipe (see src/components/base/badges/chip.tsx) applied to the
 * row's interactive actions. Chip itself renders a <span>, so these stay as
 * <a>/<button> to keep href, onClick, disabled and keyboard semantics.
 */
const actionChip =
  "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-caption-1-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-wait disabled:opacity-45";
const actionChipNeutral =
  "bg-background-secondary-default text-text-secondary hover:bg-background-secondary-hover hover:text-text-primary focus-visible:ring-black/30";
const actionChipDanger =
  "bg-status-rose-background text-status-rose-text hover:bg-background-quaternary-error focus-visible:ring-red-400/50";
const actionChipContacted =
  "bg-status-lime-background text-status-lime-text hover:bg-status-lime-background/80 focus-visible:ring-black/30";

/** Crossfades the copy glyph to a check while a copy is freshly confirmed. */
function CopyGlyph({ copied, size = 13 }: { copied: boolean; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden>
      <span
        className={cn(
          "absolute inset-0 inline-flex items-center justify-center transition-all duration-200 ease-out motion-reduce:transition-none",
          copied ? "scale-0 opacity-0 blur-[2px]" : "scale-100 opacity-100 blur-none"
        )}
      >
        <Copy size={size} weight="light" />
      </span>
      <span
        className={cn(
          "absolute inset-0 inline-flex items-center justify-center text-status-lime-text transition-all duration-200 ease-out motion-reduce:transition-none",
          copied ? "scale-100 opacity-100 blur-none" : "scale-[0.7] opacity-0 blur-[2px]"
        )}
      >
        <Check size={size} weight="bold" />
      </span>
    </span>
  );
}

export type AbandonedCheckoutQueueProps = {
  checkouts: AbandonedCheckout[];
  loading: boolean;
  error: string | null;
  actionInFlightId: string | null;
  onAction: (checkoutId: string, action: AbandonedCheckoutAction) => void | Promise<void>;
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
  onRetry,
  selectedIds = new Set(),
  onToggleSelect = () => {},
  onSelectAll = () => {},
  onOpenCheckout = () => {},
}: AbandonedCheckoutQueueProps) {
  const [dismissTarget, setDismissTarget] = useState<AbandonedCheckout | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Radix portals menu content to <body>, so selecting an item unmounts it and
  // the trailing click lands on the row underneath — which would open the
  // detail page. Ignore row clicks while a menu is open and just after it closes.
  const rowClickSuppressedUntil = useRef(0);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const markCopied = (key: string) => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    setCopiedKey(key);
    copiedTimer.current = setTimeout(() => setCopiedKey(null), 1600);
  };

  const copySummary = async (checkout: AbandonedCheckout) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(abandonedCheckoutCopySummary(checkout));
      setCopyStatus("Checkout summary copied");
      markCopied(`${checkout.id}:summary`);
    } catch {
      setCopyStatus("Could not copy checkout summary");
    }
  };

  const copyField = async (value: string, label: string, key: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label} copied`);
      markCopied(key);
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
                if (Date.now() < rowClickSuppressedUntil.current) return;
                const target = event.target as HTMLElement;
                if (target.closest("button, a, input, textarea, select, [role='button'], [role='checkbox'], [role='menuitemradio'], [role='menuitem'], [data-row-interactive='true']")) return;
                onOpenCheckout(checkout.id);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                if (Date.now() < rowClickSuppressedUntil.current) return;
                const target = event.target as HTMLElement;
                if (target.closest("button, a, input, textarea, select, [role='button'], [role='checkbox'], [role='menuitemradio'], [role='menuitem'], [data-row-interactive='true']")) return;
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
                  <Chip variant="subtle" color="gray" className="tabular-nums">
                    {formatEstimatedTotal(checkout.total)}
                  </Chip>
                </div>
                <p className="mt-3 text-xs leading-5 text-black/70">{abandonedCheckoutCartSummary(checkout.cart)}</p>
                {checkout.phone && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-black/70">
                    <Chip variant="subtle" color="gray" className="tabular-nums">
                      {checkout.phone}
                    </Chip>
                    <button
                      type="button"
                      aria-label="Copy phone number"
                      onClick={() => {
                        if (checkout.phone) void copyField(checkout.phone, "Phone number", `${checkout.id}:phone`);
                      }}
                      className="inline-flex items-center rounded-md p-1 text-black/40 transition-all duration-200 ease-out active:scale-[0.97] hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                    >
                      <CopyGlyph copied={copiedKey === `${checkout.id}:phone`} />
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
                        if (checkout.address) void copyField(checkout.address, "Address", `${checkout.id}:address`);
                      }}
                      className="inline-flex items-center rounded-md p-1 text-black/40 transition-all duration-200 ease-out active:scale-[0.97] hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                    >
                      <CopyGlyph copied={copiedKey === `${checkout.id}:address`} />
                    </button>
                  </p>
                )}
              </div>

              <div className="col-start-2 flex flex-wrap items-center gap-1.5 lg:col-start-3 lg:justify-end">
                {callHref ? (
                  <a
                    href={callHref}
                    aria-label={`Call ${checkout.phone}`}
                    className={cn(actionChip, actionChipNeutral)}
                  >
                    <Phone size={13} weight="light" aria-hidden />
                    Call
                  </a>
                ) : null}
                {whatsAppHref ? (
                  <a
                    href={whatsAppHref}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open WhatsApp for ${checkout.phone}`}
                    className={cn(actionChip, actionChipNeutral)}
                  >
                    <WhatsappLogo size={13} weight="light" aria-hidden />
                    WhatsApp
                  </a>
                ) : null}
                <button
                  type="button"
                  aria-label="Copy checkout summary"
                  onClick={() => void copySummary(checkout)}
                  className={cn(actionChip, actionChipNeutral)}
                >
                  <CopyGlyph copied={copiedKey === `${checkout.id}:summary`} />
                  {copiedKey === `${checkout.id}:summary` ? "Copied" : "Copy"}
                </button>
                <DropdownMenu
                  onOpenChange={(open) => {
                    rowClickSuppressedUntil.current = Date.now() + (open ? 60_000 : 400);
                  }}
                >
                  <DropdownMenuTrigger
                    aria-label={`Contact status: ${isNew ? ABANDONED_STATUS_LABEL.open : ABANDONED_STATUS_LABEL.contacted}`}
                    disabled={isUpdating}
                    // Fixed width so the chip does not resize between the two
                    // labels — keeps the action row from shifting on every
                    // status change, and lets the menu match it exactly while
                    // still fitting the longer option.
                    className={cn(actionChip, "w-[10.5rem] justify-start", isNew ? actionChipNeutral : actionChipContacted)}
                  >
                    {isUpdating ? (
                      <Spinner size="sm" />
                    ) : (
                      <span
                        aria-hidden
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          isNew ? "bg-rose-400" : "bg-lime-500"
                        )}
                      />
                    )}
                    {isNew ? ABANDONED_STATUS_LABEL.open : ABANDONED_STATUS_LABEL.contacted}
                    <CaretDown size={11} weight="light" aria-hidden className="ml-auto shrink-0 opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={6}
                    className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-0"
                  >
                    <DropdownMenuLabel className="px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-black/40">
                      Mark as
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={isNew ? "open" : "contacted"}
                      onValueChange={(value) => {
                        if (value === (isNew ? "open" : "contacted")) return;
                        void onAction(checkout.id, value as AbandonedCheckoutAction);
                      }}
                    >
                      {ABANDONED_STATUS_OPTIONS.map((option) => {
                        const isSelected = option.value === (isNew ? "open" : "contacted");
                        return (
                          <DropdownMenuRadioItem
                            key={option.value}
                            value={option.value}
                            className="gap-2 whitespace-nowrap px-2 text-[12px] font-medium [&>span:first-child]:hidden"
                          >
                            {/* One left glyph: a check once selected, the status dot otherwise. */}
                            <span aria-hidden className="flex h-3 w-1.5 shrink-0 items-center justify-center">
                              {isSelected
                                ? <Check size={12} weight="bold" />
                                : <span className={cn("h-1.5 w-1.5 rounded-full", option.dotClassName)} />}
                            </span>
                            {option.label}
                          </DropdownMenuRadioItem>
                        );
                      })}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  type="button"
                  aria-label="Dismiss checkout"
                  disabled={isUpdating}
                  onClick={() => setDismissTarget(checkout)}
                  className={cn(actionChip, actionChipDanger)}
                >
                  <Trash size={13} weight="light" aria-hidden />
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
