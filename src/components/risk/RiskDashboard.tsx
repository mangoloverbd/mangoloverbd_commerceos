import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { CaretDown, CaretRight, Check, Eye, MagnifyingGlass, MapPin, Plus, Prohibit, ShieldCheck, ShieldSlash, X, type Icon } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/ios-spinner";
import {
  addRiskListEntry,
  deleteRiskListEntry,
  fetchRiskAccuracy,
  fetchRiskAttempt,
  fetchRiskAttempts,
  fetchRiskLists,
  fetchRiskSettings,
  fetchRiskSummary,
  isVisibleRiskSignal,
  labelRiskAttempt,
  reasonLabel,
  updateRiskSettings,
  visibleRiskSignals,
  type RiskAccuracy,
  type RiskAttempt,
  type RiskAttemptSummary,
  type RiskListEntry,
  type RiskSettings,
  type RiskSignal,
} from "@/lib/orderRisk";

const riskMetricClass = "min-h-[92px] rounded-2xl bg-black/[0.04] px-5 py-3";
const riskLabelClass = "text-[8px] font-medium uppercase tracking-[0.3em] text-black";
const riskActionClass = "rounded-lg border border-black/15 px-3 py-2 text-xs transition-colors hover:bg-black/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:opacity-50";
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Request failed";

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("en-BD");
}

function formatRatio(value: number | null) {
  return value === null || value === undefined ? "Not enough labels" : `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function RiskMetricCard({
  label,
  value,
  description,
  delay,
  reduceMotion,
}: {
  label: string;
  value: string;
  description: string;
  delay: number;
  reduceMotion: boolean | null;
}) {
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : delay, duration: 0.35 }}
      className={riskMetricClass}
    >
      <p className={riskLabelClass}>{label}</p>
      <p className="mt-1 text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{value}</p>
      <p className="mt-0.5 text-[11px] text-black/60">{description}</p>
    </motion.div>
  );
}

function RiskSectionHeading({
  id,
  title,
  count,
  detail,
}: {
  id?: string;
  title: string;
  count?: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 py-3">
      <h2 id={id} className="font-sf-display text-[15px] font-semibold tracking-normal text-black">{title}</h2>
      {count && <><div className="h-3.5 w-px bg-black/10" /><span className="text-[13px] tabular-nums text-black/60">{count}</span></>}
      {detail && <span className="hidden text-[11px] text-black/45 sm:inline">{detail}</span>}
    </div>
  );
}

function RiskEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-black/[0.03] px-5 py-12 text-center text-sm text-black/55">
      {children}
    </div>
  );
}

function RiskDetailGroup({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-[8px] font-medium uppercase tracking-[0.25em] text-black/60">{title}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-[10px] text-black/55">{item.label}</dt>
            <dd className="mt-0.5 text-[12px] font-medium tabular-nums text-black">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function RiskSignalChips({ signals }: { signals: RiskSignal[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {visibleRiskSignals(signals).map((signal) => (
        <li
          key={signal.code}
          className="rounded-md border border-black/10 bg-white px-2 py-1 text-[10px] text-black/75"
          title={signal.evidence}
        >
          {signal.label ?? signal.code}{" "}
          <span className="tabular-nums text-black/45">{signal.points > 0 ? "+" : ""}{signal.points}</span>
        </li>
      ))}
    </ul>
  );
}

export function RiskDetails({ attempt, related = [] }: { attempt: RiskAttempt; related?: RiskAttempt[] }) {
  return (
    <div className="space-y-5 text-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-3">
          <p className={riskLabelClass}>Decision</p>
          <p className="mt-1 text-xl font-light">{attempt.decision}</p>
        </div>
        <div className="rounded-xl bg-white p-3">
          <p className={riskLabelClass}>Score</p>
          <p className="mt-1 text-xl font-light">{attempt.score}</p>
        </div>
        <div className="rounded-xl bg-white p-3">
          <p className={riskLabelClass}>Mode</p>
          <p className="mt-1 text-xs">{attempt.mode === "shadow" ? "Shadow · not enforced" : "Active"}</p>
        </div>
        <div className="rounded-xl bg-white p-3">
          <p className={riskLabelClass}>Context</p>
          <p className="mt-1 text-xs">{attempt.context_trusted ? "Signed" : "Unverified"}</p>
        </div>
      </div>
      <div>
        <p className={riskLabelClass}>Customer</p>
        <p className="mt-1 text-sm font-medium">{attempt.customer_name || "Unknown"} · {attempt.phone || "No phone"}</p>
        <p className="mt-0.5 text-xs text-black/60">{attempt.address || "No address provided"}</p>
      </div>
      <div>
        <p className={riskLabelClass}>Why</p>
        <RiskSignalChips signals={attempt.signals || []} />
        {(attempt.reasons || []).length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-black" aria-label="Decision reasons">
            {(attempt.reasons || []).map((reason) => <li key={reason}>{reasonLabel(reason)}</li>)}
          </ul>
        )}
        <ul className="mt-2 list-disc pl-5 text-xs text-black/60">
          {visibleRiskSignals(attempt.signals || []).map((signal) => <li key={`${signal.code}-evidence`}>{signal.evidence}</li>)}
        </ul>
      </div>
      <RiskDetailGroup
        title="Network & device"
        items={[
          { label: "IP address", value: attempt.ip_address || "Unknown" },
          { label: "Network", value: attempt.network_type || "Unknown network" },
          { label: "City", value: attempt.geo_city || "Unknown city" },
          { label: "Browser", value: attempt.user_agent_summary || "Unknown browser" },
        ]}
      />
      {attempt.order_id && <Link className="inline-flex underline underline-offset-2 hover:text-black/60" to={`/orders/${attempt.order_id}`}>Open order</Link>}
      {attempt.review_id && <p className="text-xs text-black/60">Held review: {attempt.review_id}</p>}
      <div>
        <p className={riskLabelClass}>Related attempts · last 7 days</p>
        {related.length ? (
          <ul className="mt-2 space-y-1 text-xs text-black/65">
            {related.map((row) => <li key={row.id}>{formatDate(row.created_at)} · {row.decision} · {row.score}</li>)}
          </ul>
        ) : <p className="mt-1 text-xs text-black/50">No linked attempts</p>}
      </div>
    </div>
  );
}

const DECISION_FILTERS = [
  { value: "all", label: "All" },
  { value: "hold", label: "Held" },
  { value: "block", label: "Blocked" },
  { value: "allow", label: "Allowed" },
] as const;

const BLOCK_REASONS = ["Fake order", "Refused delivery", "Abusive", "Bot / spam"] as const;

const decisionTone: Record<RiskAttempt["decision"], { label: string; badge: string }> = {
  ALLOW: { label: "Allowed", badge: "bg-[#EEF3EE] text-[#2F5E37]" },
  HOLD: { label: "Held", badge: "bg-[#FBF0DC] text-[#8A5A00]" },
  BLOCK: { label: "Blocked", badge: "bg-[#FBE7E5] text-[#B42318]" },
};

const cardActionClass = "inline-flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-[9px] px-3 text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-black disabled:cursor-default";
const quietAction = "bg-black/[0.04] text-black/75 hover:bg-black/[0.08] hover:text-black";

// iOS-style sheet curve: quick to start, long soft settle.
const DRAWER_EASE = [0.32, 0.72, 0, 1] as const;

function initialsOf(name: string | null) {
  const words = (name || "?").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "?";
}

function whySummary(signals: RiskSignal[] | undefined) {
  const visible = visibleRiskSignals(signals || []);
  if (!visible.length) return "No risk signals";
  return visible.map((signal) => `${signal.label ?? signal.code} ${signal.points > 0 ? "+" : ""}${signal.points}`).join(" · ");
}

// Right-side drawer that slides in and out with Framer Motion. Esc, the
// backdrop and the close button dismiss it; focus returns to the opener.
function RiskDrawer({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
      openerRef.current?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="risk-drawer-backdrop"
            aria-hidden
            className="fixed inset-0 z-50 bg-black/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.3, ease: "easeOut" }}
            onClick={onClose}
          />
          <motion.aside
            key="risk-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col bg-white shadow-[-16px_0_40px_rgba(0,0,0,0.12)]"
            initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            transition={reduceMotion ? { duration: 0.12 } : { duration: 0.42, ease: DRAWER_EASE }}
          >
            <button
              ref={closeRef}
              type="button"
              aria-label={`Close ${label.toLowerCase()}`}
              onClick={onClose}
              className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-black/50 transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-black"
            >
              <X size={16} weight="light" />
            </button>
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

type BlockKind = "phone" | "device";

export function RiskAttemptsPanel() {
  const reduceMotion = useReducedMotion();
  const [decision, setDecision] = useState("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [attempts, setAttempts] = useState<RiskAttempt[]>([]);
  const [summary, setSummary] = useState<RiskAttemptSummary | null>(null);
  const [selected, setSelected] = useState<RiskAttempt | null>(null);
  const [related, setRelated] = useState<RiskAttempt[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  // The attempt the drawer was last asked to show; slower replies for others are dropped.
  const requestedId = useRef<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  // Cursor history: the last entry is the current page's `before`; earlier ones go back to newer pages.
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [blockKind, setBlockKind] = useState<BlockKind | null>(null);
  const [blockReason, setBlockReason] = useState<string>(BLOCK_REASONS[0]);
  const [blockNote, setBlockNote] = useState("");
  const [blocked, setBlocked] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState("");
  const [listsOpen, setListsOpen] = useState(false);
  const before = cursors[cursors.length - 1];

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setCursors([undefined]);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchRiskAttempts({ decision, before, ...(search ? { q: search } : {}) })
      .then(({ attempts: rows }) => { if (!cancelled) setAttempts(rows); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [decision, before, search]);

  const refreshSummary = () => {
    fetchRiskSummary().then(setSummary).catch(() => setSummary(null));
  };
  useEffect(refreshSummary, []);

  async function openAttempt(id: string, nextBlock: BlockKind | null = null) {
    setBlockKind(nextBlock);
    setNotice("");
    setDrawerOpen(true);
    if (requestedId.current === id) return;
    requestedId.current = id;
    // Show the clicked attempt at once from its list row; details fill in when they arrive.
    const summaryRow = attempts.find((row) => row.id === id) ?? null;
    setSelected(summaryRow);
    setRelated([]);
    setDetailsLoading(true);
    try {
      const detail = await fetchRiskAttempt(id);
      if (requestedId.current !== id) return;
      setSelected({ ...detail.attempt, order_number: summaryRow?.order_number ?? null });
      setRelated(detail.related);
      setError("");
    } catch (err) {
      if (requestedId.current !== id) return;
      requestedId.current = null;
      setDrawerOpen(false);
      setError(errorMessage(err));
    } finally {
      if (requestedId.current === id) setDetailsLoading(false);
    }
  }

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setBlockKind(null);
  }, []);
  const closeLists = useCallback(() => setListsOpen(false), []);

  async function updateLabel(id: string, label: "fake" | "genuine") {
    setBusy(`${id}:${label}`);
    try {
      const result = await labelRiskAttempt(id, label);
      setAttempts((rows) => rows.map((row) => (row.id === id ? { ...row, label } : row)));
      setSelected((current) => (current?.id === id ? { ...current, ...result.attempt, label } : current));
      setNotice(label === "fake" ? "Marked as a fake order." : "Marked genuine. This phone and device are now trusted.");
      setError("");
      refreshSummary();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }

  async function confirmBlock() {
    if (!selected || !blockKind) return;
    const reason = blockNote.trim() ? `${blockReason}: ${blockNote.trim()}` : blockReason;
    setBusy(`${selected.id}:block`);
    try {
      await addRiskListEntry(selected.id, "block", [blockKind], reason);
      setBlocked((current) => ({ ...current, [`${selected.id}:${blockKind}`]: true }));
      setNotice(`Blocked this ${blockKind}. Future checkouts from it will be stopped.`);
      setBlockKind(null);
      setBlockNote("");
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }

  const selectedTone = selected ? decisionTone[selected.decision] : null;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-black">Attempts</h2>
          <p className="mt-1 text-[13px] text-black/55" data-testid="attempt-summary">
            {summary ? (
              <>
                Last {summary.days} days · <span className="font-medium text-[#8A5A00]">{formatNumber(summary.held)} held</span>
                {" · "}{formatNumber(summary.blocked)} blocked · {formatNumber(summary.unlabelled)} not labelled · {formatNumber(summary.fake)} marked fake
              </>
            ) : "Every checkout we scored. Search, review and act in one place."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setListsOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] text-black ring-1 ring-inset ring-black/[0.08] transition-colors hover:bg-black/[0.03]"
        >
          <ShieldSlash size={14} weight="light" /> Blocked &amp; allowed
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-11 min-w-0 flex-[1_1_300px] items-center gap-2.5 rounded-xl bg-white px-3.5 ring-1 ring-inset ring-black/[0.08] transition-shadow focus-within:ring-black/25">
          <MagnifyingGlass size={16} weight="light" className="shrink-0 text-black/50" aria-hidden />
          <span className="sr-only">Search attempts</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone or order number"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-black/40 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" aria-label="Clear search" className="rounded-md p-1 text-black/50 hover:bg-black/[0.05] hover:text-black" onClick={() => setQuery("")}>
              <X size={13} weight="light" />
            </button>
          )}
        </label>
        <div className="flex gap-0.5 rounded-xl bg-black/[0.06] p-1" role="group" aria-label="Decision">
          {DECISION_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={decision === filter.value}
              onClick={() => { setDecision(filter.value); setCursors([undefined]); }}
              className={`h-9 rounded-[9px] px-3.5 text-[13px] transition-colors ${decision === filter.value ? "bg-white text-black shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-black/55 hover:text-black"}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && !drawerOpen && <p role="status" className="rounded-lg bg-[#EEF3EE] px-3 py-2 text-sm text-[#2F5E37]">{notice}</p>}

      {loading ? (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-black/60" role="status">
          <Spinner size="sm" /> Loading attempts…
        </div>
      ) : attempts.length === 0 ? (
        <RiskEmptyState>
          {search ? `No attempts match “${search}”. Try a phone number or an order number.` : "No attempts match this decision filter."}
        </RiskEmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {attempts.map((row, index) => {
            const tone = decisionTone[row.decision];
            const isOpen = drawerOpen && selected?.id === row.id;
            const isFake = row.label === "fake";
            const phoneBlocked = blocked[`${row.id}:phone`];
            const deviceBlocked = blocked[`${row.id}:device`];
            return (
              <motion.li
                key={row.id}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.03, 0.18), duration: 0.28, ease: "easeOut" }}
                className={`overflow-hidden rounded-2xl bg-white transition-shadow ${isOpen ? "shadow-[0_0_0_2px_#121212]" : "shadow-[0_0_0_1px_rgba(0,0,0,0.07),0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-[0_0_0_1px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.05)]"}`}
              >
                <button
                  type="button"
                  aria-label={`${row.customer_name || "Unknown"} ${row.decision} ${row.score}`}
                  aria-haspopup="dialog"
                  aria-expanded={isOpen}
                  onClick={() => void openAttempt(row.id)}
                  className="flex w-full items-start gap-3.5 px-4 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black/25 sm:px-5"
                >
                  <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-medium ${tone.badge}`}>{initialsOf(row.customer_name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2.5">
                      <span className="truncate text-[15px] font-semibold text-black">{row.customer_name || "Unknown customer"}</span>
                      {row.order_number && <span className="text-[12px] text-black/55">{row.order_number}</span>}
                    </span>
                    <span className="mt-1 block font-mono text-[14px] text-black">{row.phone || "No phone"}</span>
                    <span className="mt-1 block text-[12px] text-black/50">
                      {formatDate(row.created_at)}{row.mode === "shadow" ? " · Shadow" : ""}
                      {row.ip_address && <> · <span className="whitespace-nowrap font-mono">IP {row.ip_address}</span></>}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${tone.badge}`}>{tone.label}</span>
                    <span className="text-[12px] text-black/55">Score {row.score}</span>
                  </span>
                </button>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.05] px-4 py-2.5 sm:px-5">
                  <span className="min-w-0 truncate text-[12px] text-black/55">{whySummary(row.topSignals)}</span>
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      aria-label={`Mark ${row.customer_name || "attempt"} fake`}
                      aria-pressed={isFake}
                      disabled={isFake || busy === `${row.id}:fake`}
                      onClick={() => void updateLabel(row.id, "fake")}
                      className={`${cardActionClass} ${isFake ? "bg-[#B42318] text-white" : quietAction}`}
                    >
                      {isFake && <Check size={12} weight="light" aria-hidden />}{isFake ? "Marked fake" : "Fake"}
                    </button>
                    <button
                      type="button"
                      aria-label={`Block ${row.customer_name || "attempt"} phone`}
                      disabled={phoneBlocked}
                      onClick={() => void openAttempt(row.id, "phone")}
                      className={`${cardActionClass} ${phoneBlocked ? "bg-[#FBE7E5] text-[#B42318]" : quietAction}`}
                    >
                      {phoneBlocked ? "Phone blocked" : "Block phone"}
                    </button>
                    <button
                      type="button"
                      aria-label={`Block ${row.customer_name || "attempt"} device`}
                      disabled={deviceBlocked}
                      onClick={() => void openAttempt(row.id, "device")}
                      className={`${cardActionClass} ${deviceBlocked ? "bg-[#FBE7E5] text-[#B42318]" : quietAction}`}
                    >
                      {deviceBlocked ? "Device blocked" : "Block device"}
                    </button>
                  </span>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      {!loading && attempts.length > 0 && (
        <div className="flex items-center justify-between gap-3 pt-1 text-[12px] text-black/55">
          <span>{attempts.length} shown · newest first</span>
          <span className="flex gap-1.5">
            <button type="button" className={riskActionClass} disabled={cursors.length <= 1} onClick={() => setCursors((stack) => stack.slice(0, -1))}>Newer</button>
            <button type="button" className={riskActionClass} disabled={attempts.length < 50} onClick={() => setCursors((stack) => [...stack, attempts.at(-1)?.created_at])}>Older</button>
          </span>
        </div>
      )}

      <RiskDrawer open={drawerOpen} onClose={closeDrawer} label="Investigation">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-black/60" role="status"><Spinner size="sm" /> Loading…</div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selected.id}
              className="flex min-h-0 flex-1 flex-col"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
            >
              <div className="space-y-1.5 border-b border-black/[0.06] px-6 pb-5 pt-6 pr-14">
                <h3 className="sr-only">Investigation</h3>
                {selectedTone && <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-medium ${selectedTone.badge}`}>{selectedTone.label} · score {selected.score}</span>}
                <p className="text-[20px] font-semibold tracking-[-0.01em] text-black">{selected.customer_name || "Unknown customer"}</p>
                <p className="font-mono text-[14px] text-black">{selected.phone || "No phone"}</p>
                <p className="text-[12px] text-black/55">
                  {selected.order_number ? `Order ${selected.order_number} · ` : ""}{formatDate(selected.created_at)}
                  {selected.ip_address && <> · <span className="font-mono">IP {selected.ip_address}</span></>}
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {detailsLoading ? (
                  <div className="space-y-3" role="status" aria-label="Loading attempt details">
                    {[0, 1, 2].map((line) => (
                      <div key={line} className="h-12 animate-pulse rounded-xl bg-black/[0.04]" />
                    ))}
                  </div>
                ) : (
                  <RiskDetails attempt={selected} related={related} />
                )}
              </div>

              <div className="space-y-3 border-t border-black/[0.06] bg-[#FBFBF9] px-6 py-5">
                {notice && <p role="status" className="rounded-lg bg-[#EEF3EE] px-3 py-2 text-[12px] text-[#2F5E37]">{notice}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={selected.label === "genuine" || busy === `${selected.id}:genuine`}
                    onClick={() => void updateLabel(selected.id, "genuine")}
                    className={`h-11 rounded-xl text-[14px] font-medium transition-colors ${selected.label === "genuine" ? "bg-[#2F5E37] text-white" : "bg-white text-black ring-1 ring-inset ring-black/10 hover:bg-black/[0.03]"}`}
                  >
                    Genuine customer
                  </button>
                  <button
                    type="button"
                    disabled={selected.label === "fake" || busy === `${selected.id}:fake`}
                    onClick={() => void updateLabel(selected.id, "fake")}
                    className={`h-11 rounded-xl text-[14px] font-medium transition-colors ${selected.label === "fake" ? "bg-[#B42318] text-white" : "bg-black text-white hover:bg-black/85"}`}
                  >
                    Fake order
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["phone", "device"] as const).map((kind) => {
                    const done = blocked[`${selected.id}:${kind}`];
                    return (
                      <button
                        key={kind}
                        type="button"
                        disabled={done}
                        aria-pressed={blockKind === kind}
                        onClick={() => setBlockKind(blockKind === kind ? null : kind)}
                        className={`h-10 rounded-xl text-[13px] transition-colors ${done ? "bg-[#FBE7E5] text-[#B42318]" : blockKind === kind ? "bg-[#B42318] text-white" : "bg-white text-[#B42318] ring-1 ring-inset ring-black/10 hover:bg-[#FBE7E5]/60"}`}
                      >
                        {done ? `${kind === "phone" ? "Phone" : "Device"} blocked` : `Block this ${kind}`}
                      </button>
                    );
                  })}
                </div>
                <AnimatePresence initial={false}>
                  {blockKind && (
                    <motion.div
                      initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.24, ease: DRAWER_EASE }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2.5 rounded-xl bg-white p-3 ring-1 ring-inset ring-black/[0.08]">
                        <p className="text-[12px] text-black">Why block this {blockKind}?</p>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Block reason">
                          {BLOCK_REASONS.map((reason) => (
                            <button
                              key={reason}
                              type="button"
                              aria-pressed={blockReason === reason}
                              onClick={() => setBlockReason(reason)}
                              className={`h-8 rounded-lg px-2.5 text-[12px] transition-colors ${blockReason === reason ? "bg-black text-white" : quietAction}`}
                            >
                              {reason}
                            </button>
                          ))}
                        </div>
                        <label className="block text-[11px] text-black/55">
                          Note (optional)
                          <input
                            value={blockNote}
                            maxLength={160}
                            onChange={(event) => setBlockNote(event.target.value)}
                            placeholder="e.g. 3 orders refused this week"
                            className="mt-1 h-9 w-full rounded-lg bg-black/[0.04] px-2.5 text-[13px] text-black outline-none focus:bg-white focus:ring-1 focus:ring-black/20"
                          />
                        </label>
                        <div className="flex justify-end gap-1.5">
                          <button type="button" className="h-9 rounded-lg px-3 text-[13px] text-black/60 hover:text-black" onClick={() => setBlockKind(null)}>Cancel</button>
                          <button
                            type="button"
                            disabled={busy === `${selected.id}:block`}
                            onClick={() => void confirmBlock()}
                            className="h-9 rounded-lg bg-[#B42318] px-3.5 text-[13px] text-white hover:bg-[#9A1F15] disabled:opacity-60"
                          >
                            Confirm block
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </RiskDrawer>

      <RiskDrawer open={listsOpen} onClose={closeLists} label="Blocked and allowed">
        <div className="min-h-0 flex-1 overflow-y-auto pt-4">
          <RiskListsPanel />
        </div>
      </RiskDrawer>
    </div>
  );
}

export function RiskListsPanel() {
  const reduceMotion = useReducedMotion();
  const [list, setList] = useState<"block" | "allow">("block");
  const [entries, setEntries] = useState<RiskListEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchRiskLists(list)
      .then((result) => { if (!cancelled) setEntries(result.entries); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [list]);

  async function removeEntry(id: string) {
    try {
      await deleteRiskListEntry(id);
      setEntries((current) => current.filter((entry) => entry.id !== id));
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={riskLabelClass}>Identity controls</p>
          <p className="mt-1 text-[11px] text-black/55">Manage trusted and blocked checkout identities.</p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Risk list">
          {(["block", "allow"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={list === value}
              className={`${riskActionClass} ${list === value ? "bg-black text-white hover:bg-black/85" : "bg-white"}`}
              onClick={() => setList(value)}
            >
              {value === "block" ? "Blocklist" : "Allowlist"}
            </button>
          ))}
        </div>
      </div>

      <RiskSectionHeading title={list === "block" ? "Blocklist" : "Allowlist"} count={`${entries.length} ${entries.length === 1 ? "entry" : "entries"}`} detail="Safe display hints only" />
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {loading ? (
        <div className="flex min-h-40 items-center justify-center gap-2 rounded-2xl bg-black/[0.03] text-sm text-black/60" role="status">
          <Spinner size="sm" /> Loading {list === "block" ? "blocklist" : "allowlist"}…
        </div>
      ) : entries.length === 0 ? (
        <RiskEmptyState>No entries in this list.</RiskEmptyState>
      ) : (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.3 }}
          className="divide-y divide-black/[0.08] overflow-hidden rounded-2xl bg-black/[0.04]"
        >
          {entries.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <p className={riskLabelClass}>{list === "block" ? "Blocklist" : "Allowlist"}</p>
                <p className="mt-1 truncate text-sm font-medium text-black">{entry.display_hint || "Identity"}</p>
                <p className="mt-0.5 text-xs text-black/55">{entry.kind} · {entry.reason || "No reason recorded"}</p>
                <p className="mt-1 text-[10px] text-black/45">Added {formatDate(entry.created_at)}</p>
              </div>
              <button type="button" className={riskActionClass} onClick={() => void removeEntry(entry.id)}>Remove</button>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

export function RiskAccuracyPanel() {
  const reduceMotion = useReducedMotion();
  const [days, setDays] = useState<7 | 30>(7);
  const [accuracy, setAccuracy] = useState<RiskAccuracy | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setAccuracy(null);
    setError("");
    fetchRiskAccuracy(days)
      .then((value) => { if (!cancelled) setAccuracy(value); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); });
    return () => { cancelled = true; };
  }, [days]);

  if (error) return <div className="p-4 sm:p-5"><p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p></div>;
  if (!accuracy) return <div className="flex min-h-40 items-center justify-center gap-2 p-4 text-sm text-black/60" role="status"><Spinner size="sm" /> Loading accuracy…</div>;

  const summaryCards = [
    ["Assessments", formatNumber(accuracy.overall.attempts), "Risk decisions evaluated"],
    ["Hold rate", formatRatio(accuracy.overall.holdRate), "Of all assessments"],
    ["Block precision", formatRatio(accuracy.overall.blockPrecision), "Confirmed fake among blocks"],
    ["Fake caught", formatRatio(accuracy.overall.fakeCaught), "Confirmed fake caught"],
  ] as const;
  const targets = [
    ["Block precision", accuracy.overall.targets.blockPrecision],
    ["Hold rate", accuracy.overall.targets.holdRate],
    ["Fake caught", accuracy.overall.targets.fakeCaught],
  ] as const;

  return (
    <div className="space-y-5 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={riskLabelClass}>Model performance</p>
          <p className="mt-1 text-[11px] text-black/55">Use labeled outcomes to tune protection without guessing.</p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Accuracy range">
          {([7, 30] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={days === value}
              className={`${riskActionClass} ${days === value ? "bg-black text-white hover:bg-black/85" : "bg-white"}`}
              onClick={() => setDays(value)}
            >
              {value} days
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-black/55">{accuracy.overall.attempts} assessments · {accuracy.overall.labelledFake + accuracy.overall.labelledGenuine} labeled outcomes. Shadow decisions are included.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map(([label, value, description], index) => (
          <RiskMetricCard key={label} label={label} value={value} description={description} delay={0.02 + index * 0.04} reduceMotion={reduceMotion} />
        ))}
      </div>

      <div className="rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5">
        <p className={riskLabelClass}>Labeled outcomes</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><p className="text-[10px] text-black/55">Genuine held</p><p className="mt-1 text-xl font-light tabular-nums">{accuracy.overall.heldGenuine}</p></div>
          <div><p className="text-[10px] text-black/55">Genuine blocked</p><p className="mt-1 text-xl font-light tabular-nums">{accuracy.overall.blockedGenuine}</p></div>
          <div><p className="text-[10px] text-black/55">Fake missed</p><p className="mt-1 text-xl font-light tabular-nums">{accuracy.overall.fakeSlipped}</p></div>
          <div><p className="text-[10px] text-black/55">Labeled total</p><p className="mt-1 text-xl font-light tabular-nums">{accuracy.overall.labelledFake + accuracy.overall.labelledGenuine}</p></div>
        </div>
      </div>

      <section aria-labelledby="risk-signal-accuracy-heading">
        <RiskSectionHeading id="risk-signal-accuracy-heading" title="Signal accuracy" count={`${accuracy.signals.filter((row) => row.fired && isVisibleRiskSignal(row.code)).length} fired`} />
        {accuracy.signals.filter((row) => row.fired && isVisibleRiskSignal(row.code)).length === 0 ? (
          <RiskEmptyState>No signals recorded in this period.</RiskEmptyState>
        ) : (
          <div className="divide-y divide-black/[0.08] overflow-hidden rounded-2xl bg-black/[0.04]">
            {accuracy.signals.filter((row) => row.fired && isVisibleRiskSignal(row.code)).map((row) => {
              const precision = row.precisionFake === null ? null : Math.max(0, Math.min(1, row.precisionFake));
              return (
                <div key={row.code} className="px-4 py-3 sm:px-5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-black">{row.code}</span>
                    <span className="shrink-0 tabular-nums text-black/55">{row.fired} fired · {formatRatio(row.precisionFake)} confirmed fake</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.08]" aria-hidden="true">
                    <div className="h-full rounded-full bg-black/70 transition-[width] duration-300" style={{ width: `${(precision ?? 0) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="risk-targets-heading">
        <RiskSectionHeading id="risk-targets-heading" title="Targets" count="Operating thresholds" />
        <div className="grid gap-2 sm:grid-cols-3">
          {targets.map(([label, target]) => (
            <div key={label} className="rounded-xl bg-black/[0.04] px-3 py-3">
              <p className="text-[10px] text-black/55">{label}</p>
              <p className="mt-1 text-sm font-medium tabular-nums">Target {formatRatio(target.target)}</p>
              <p className="mt-0.5 text-[10px] text-black/45">{target.pass === null ? "Not enough labels" : target.pass ? "On target" : "Needs review"}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const riskModeOptions: Array<{ value: RiskSettings["mode"]; label: string; description: string; icon: Icon }> = [
  { value: "off", label: "Off", description: "No risk checks run at checkout.", icon: ShieldSlash },
  { value: "shadow", label: "Shadow", description: "Score every order and log decisions without blocking anyone.", icon: Eye },
  { value: "active", label: "Active", description: "Enforce decisions — risky orders are held or blocked at checkout.", icon: ShieldCheck },
];

function RiskSettingsGroup({
  icon: GroupIcon,
  title,
  description,
  aside,
  children,
}: {
  icon: Icon;
  title: string;
  description: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const headingId = `risk-settings-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section className="space-y-3" aria-labelledby={headingId}>
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/[0.05] text-black">
            <GroupIcon weight="light" size={16} />
          </span>
          <div className="min-w-0">
            <h2 id={headingId} className="text-[14px] font-semibold leading-none text-black">{title}</h2>
            <p className="mt-1 text-[12px] leading-snug text-black/60">{description}</p>
          </div>
        </div>
        {aside}
      </div>
      <div className="overflow-hidden rounded-2xl bg-black/[0.04]">{children}</div>
    </section>
  );
}

export function RiskSettingsPanel() {
  const [settings, setSettings] = useState<RiskSettings | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [districtQuery, setDistrictQuery] = useState("");
  const [termDraft, setTermDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchRiskSettings()
      .then((value) => { if (!cancelled) setSettings(value); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); });
    return () => { cancelled = true; };
  }, []);

  if (!settings) {
    return (
      <div className="p-4 sm:p-5">
        {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-black/60" role="status"><Spinner size="sm" /> Loading settings…</div>}
      </div>
    );
  }

  const query = districtQuery.trim().toLowerCase();
  const visibleDistricts = query
    ? settings.districtOptions.filter((district) => district.name.toLowerCase().includes(query))
    : settings.districtOptions;

  function toggleDistrict(id: string) {
    if (!settings) return;
    setSettings({
      ...settings,
      haterDistrictIds: settings.haterDistrictIds.includes(id)
        ? settings.haterDistrictIds.filter((value) => value !== id)
        : [...settings.haterDistrictIds, id],
    });
  }

  function addTerms(raw: string) {
    if (!settings) return;
    const incoming = raw.split(/[\n,]/).map((term) => term.trim()).filter(Boolean);
    const next = [...settings.extraAbuseTerms];
    for (const term of incoming) {
      if (!next.some((existing) => existing.toLowerCase() === term.toLowerCase())) next.push(term);
    }
    setSettings({ ...settings, extraAbuseTerms: next });
    setTermDraft("");
  }

  return (
    <form
      className="space-y-8 p-4 sm:p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError("");
        setMessage("");
        try {
          const pending = termDraft.trim() ? { ...settings, extraAbuseTerms: [...settings.extraAbuseTerms, termDraft.trim()] } : settings;
          const saved = await updateRiskSettings(pending);
          setSettings(saved);
          setTermDraft("");
          setMessage("Settings saved");
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
        <div className="space-y-10">
          <RiskSettingsGroup icon={ShieldCheck} title="Protection mode" description="Choose whether risk decisions are observed only or enforced at checkout.">
            <div role="radiogroup" aria-label="Protection mode" className="divide-y divide-black/[0.06]">
              {riskModeOptions.map(({ value, label, description, icon: ModeIcon }) => {
                const selected = settings.mode === value;
                return (
                  <label
                    key={value}
                    className="flex min-h-[60px] cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-black/[0.02] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-black"
                  >
                    <input
                      type="radio"
                      name="risk-mode"
                      value={value}
                      checked={selected}
                      onChange={() => setSettings({ ...settings, mode: value })}
                      className="sr-only"
                    />
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${selected ? "bg-black text-white" : "bg-white text-black"}`}>
                      <ModeIcon weight="light" size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-black">{label}</span>
                      <span className="mt-0.5 block text-[11px] text-black/60">{description}</span>
                    </span>
                    <span
                      aria-hidden
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${selected ? "border-black bg-black text-white" : "border-black/20 bg-white"}`}
                    >
                      {selected && <Check weight="bold" size={10} />}
                    </span>
                  </label>
                );
              })}
            </div>
          </RiskSettingsGroup>

          <RiskSettingsGroup
            icon={Prohibit}
            title="Additional abuse terms"
            description="Product or checkout language that should push an order toward review."
            aside={settings.extraAbuseTerms.length > 0 ? (
              <span className="shrink-0 rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] tabular-nums text-black/70">
                {settings.extraAbuseTerms.length} {settings.extraAbuseTerms.length === 1 ? "term" : "terms"}
              </span>
            ) : undefined}
          >
            <div className="space-y-3 p-3">
              <div className="flex items-center gap-2">
                <input
                  aria-label="Add abuse term"
                  placeholder="Type a term and press Enter"
                  value={termDraft}
                  onChange={(event) => setTermDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addTerms(termDraft);
                    }
                  }}
                  onPaste={(event) => {
                    const text = event.clipboardData.getData("text");
                    if (/[\n,]/.test(text)) {
                      event.preventDefault();
                      addTerms(text);
                    }
                  }}
                  className="h-9 flex-1 rounded-lg border border-black/[0.1] bg-white px-3 text-[13px] text-black placeholder:text-black/35 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/20"
                />
                <button
                  type="button"
                  onClick={() => addTerms(termDraft)}
                  disabled={!termDraft.trim()}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-[12px] text-black transition-colors hover:bg-black/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus weight="light" size={14} /> Add
                </button>
              </div>
              {settings.extraAbuseTerms.length === 0 ? (
                <p className="px-1 text-[12px] text-black/50">No extra terms yet — the built-in abuse list still applies.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5" aria-label="Abuse terms">
                  {settings.extraAbuseTerms.map((term) => (
                    <li key={term} className="inline-flex h-8 items-center gap-1 rounded-full bg-white pl-3 pr-1 text-[12px] text-black">
                      {term}
                      <button
                        type="button"
                        aria-label={`Remove ${term}`}
                        onClick={() => setSettings({ ...settings, extraAbuseTerms: settings.extraAbuseTerms.filter((value) => value !== term) })}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-black/45 transition-colors hover:bg-black/[0.06] hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-black"
                      >
                        <X weight="light" size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </RiskSettingsGroup>
        </div>

        <RiskSettingsGroup
          icon={MapPin}
          title="Districts requiring review"
          description="Hold incomplete or unfamiliar checkouts from these districts for review."
          aside={(
            <span className="shrink-0 rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] tabular-nums text-black/70">
              {settings.haterDistrictIds.length} selected
            </span>
          )}
        >
          <div className="flex items-center gap-2 border-b border-black/[0.06] px-3 py-2.5">
            <div className="relative flex-1">
              <MagnifyingGlass weight="light" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
              <input
                type="search"
                aria-label="Search districts"
                placeholder="Search districts"
                value={districtQuery}
                onChange={(event) => setDistrictQuery(event.target.value)}
                className="h-9 w-full rounded-lg border border-black/[0.1] bg-white pl-8 pr-3 text-[13px] text-black placeholder:text-black/35 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/20"
              />
            </div>
            {settings.haterDistrictIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSettings({ ...settings, haterDistrictIds: [] })}
                className="h-9 shrink-0 rounded-lg px-3 text-[12px] text-black/60 transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-black"
              >
                Clear
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto p-3 lg:max-h-[420px]">
            {visibleDistricts.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-black/50">No districts match “{districtQuery}”.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {visibleDistricts.map((district) => {
                  const selected = settings.haterDistrictIds.includes(district.id);
                  return (
                    <button
                      key={district.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleDistrict(district.id)}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${selected ? "bg-black text-white" : "bg-white text-black/75 hover:bg-black/[0.06] hover:text-black"}`}
                    >
                      {selected && <Check weight="bold" size={10} />}
                      {district.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </RiskSettingsGroup>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-black/[0.08] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-h-5 text-[12px]">
          {error && <p role="alert" className="text-red-700">{error}</p>}
          {message && <p role="status" className="inline-flex items-center gap-1.5 text-black/70"><Check weight="light" size={14} /> {message}</p>}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-black px-4 text-[12px] text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:opacity-35"
        >
          {saving && <Spinner size="sm" />}
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
