import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/ios-spinner";
import {
  addRiskListEntry,
  deleteRiskListEntry,
  fetchRiskAccuracy,
  fetchRiskAttempt,
  fetchRiskAttempts,
  fetchRiskLists,
  fetchRiskSettings,
  isVisibleRiskSignal,
  labelRiskAttempt,
  updateRiskSettings,
  visibleRiskSignals,
  type RiskAccuracy,
  type RiskAttempt,
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

const REASON_LABELS: Record<string, string> = {
  incomplete_address_unknown: "Incomplete address from a number with no trust record",
  confirmed_fake_history: "Previously confirmed fake orders on this phone or device",
  independent_high_families: "Strong signals from independent checks",
  honeypot_filled: "Hidden bot-trap field was filled",
  staff_allowlist: "Allowlisted by staff",
  untrusted_context: "Unverified browser context",
  dependency_unavailable: "A data source was unavailable during assessment",
  engine_error: "Assessment error (order was not penalized)",
  review_unavailable: "Staff review could not be saved, so the order proceeded",
  webhook_review_unsupported: "Server-to-server order, review not supported",
};

function reasonLabel(reason: string) {
  if (REASON_LABELS[reason]) return REASON_LABELS[reason];
  if (reason.startsWith("critical:")) return `Critical signal: ${reason.slice("critical:".length)}`;
  if (reason.startsWith("score>=")) return `High risk score (${reason.slice("score".length)})`;
  return reason;
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

export function RiskAttemptsPanel() {
  const reduceMotion = useReducedMotion();
  const [decision, setDecision] = useState("all");
  const [attempts, setAttempts] = useState<RiskAttempt[]>([]);
  const [selected, setSelected] = useState<RiskAttempt | null>(null);
  const [related, setRelated] = useState<RiskAttempt[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [before, setBefore] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchRiskAttempts({ decision, before })
      .then(({ attempts: rows }) => { if (!cancelled) setAttempts(rows); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [decision, before]);

  async function openAttempt(id: string) {
    try {
      const detail = await fetchRiskAttempt(id);
      setSelected(detail.attempt);
      setRelated(detail.related);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function updateLabel(label: "fake" | "genuine") {
    if (!selected) return;
    try {
      const result = await labelRiskAttempt(selected.id, label);
      setSelected((current) => current ? { ...current, ...result.attempt } : result.attempt);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function blockIdentity(kind: "phone" | "device") {
    if (!selected) return;
    const reason = window.prompt(`Reason to block ${kind} (required)`);
    if (!reason?.trim()) return;
    try {
      await addRiskListEntry(selected.id, "block", [kind], reason);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const heldCount = attempts.filter((row) => row.decision === "HOLD").length;
  const blockedCount = attempts.filter((row) => row.decision === "BLOCK").length;
  const averageScore = attempts.length === 0
    ? "—"
    : (attempts.reduce((sum, row) => sum + row.score, 0) / attempts.length).toFixed(1);

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={riskLabelClass}>Assessment history</p>
          <p className="mt-1 text-[11px] text-black/55">Investigate checkout decisions and label outcomes for better accuracy.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="risk-decision" className={riskLabelClass}>Decision</label>
          <select
            id="risk-decision"
            className="h-8 rounded-lg border border-black/15 bg-transparent px-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-black"
            value={decision}
            onChange={(event) => { setDecision(event.target.value); setBefore(undefined); setSelected(null); }}
          >
            <option value="all">All attempts</option>
            <option value="allow">Allowed</option>
            <option value="hold">Held</option>
            <option value="block">Blocked</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <RiskMetricCard label="Loaded attempts" value={formatNumber(attempts.length)} description="Current result set" delay={0.02} reduceMotion={reduceMotion} />
        <RiskMetricCard label="Held" value={formatNumber(heldCount)} description="Awaiting review" delay={0.06} reduceMotion={reduceMotion} />
        <RiskMetricCard label="Blocked" value={formatNumber(blockedCount)} description="Prevented checkout" delay={0.1} reduceMotion={reduceMotion} />
        <RiskMetricCard label="Average score" value={averageScore} description="Across loaded attempts" delay={0.14} reduceMotion={reduceMotion} />
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <RiskSectionHeading title="Assessment history" count={`${attempts.length} loaded`} detail="Newest first" />

      {loading ? (
        <div className="flex min-h-40 items-center justify-center gap-2 rounded-2xl bg-black/[0.03] text-sm text-black/60" role="status">
          <Spinner size="sm" /> Loading attempts…
        </div>
      ) : attempts.length === 0 ? (
        <RiskEmptyState>No attempts match this decision filter.</RiskEmptyState>
      ) : (
        <div className="grid gap-3">
          {attempts.map((row, index) => {
            const detailsId = `risk-attempt-details-${row.id}`;
            const expanded = selected?.id === row.id;
            return (
              <motion.article
                key={row.id}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.04, 0.2), duration: 0.3 }}
                className="overflow-hidden rounded-2xl bg-black/[0.04] transition-colors hover:bg-black/[0.055]"
              >
                <button
                  type="button"
                  aria-label={`${row.customer_name || "Unknown"} ${row.decision} ${row.score}`}
                  aria-expanded={expanded}
                  aria-controls={detailsId}
                  onClick={() => {
                    if (expanded) {
                      setSelected(null);
                      setRelated([]);
                    } else {
                      void openAttempt(row.id);
                    }
                  }}
                  className="group flex w-full items-start justify-between gap-4 px-4 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black/25 sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold tracking-tight text-black">{row.customer_name || "Unknown customer"}</span>
                    <span className="mt-1 block text-[11px] text-black/60">{formatDate(row.created_at)} · {row.mode === "shadow" ? "Shadow" : "Active"}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-right">
                      <span className="block text-[15px] font-light tabular-nums">{row.decision} · {row.score}</span>
                      <span className="mt-0.5 block text-[10px] text-black/50">Open investigation</span>
                    </span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-black/60 transition-colors group-hover:text-black">
                      {expanded ? <CaretDown size={15} weight="light" /> : <CaretRight size={15} weight="light" />}
                    </span>
                  </span>
                </button>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.08] px-4 py-3 sm:px-5">
                  <RiskSignalChips signals={row.topSignals || []} />
                  <span className="text-[10px] text-black/50">{row.label ? `Labeled ${row.label}` : "Not labeled"}</span>
                </div>
                <AnimatePresence initial={false}>
                  {expanded && selected && (
                    <motion.div
                      id={detailsId}
                      initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                      transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
                      className="border-t border-black/[0.08] px-4 py-5 sm:px-5"
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="text-lg font-light">Investigation</h3>
                        <button type="button" className={riskActionClass} onClick={() => { setSelected(null); setRelated([]); }}>Close investigation</button>
                      </div>
                      <RiskDetails attempt={selected} related={related} />
                      <div className="mt-5 flex flex-wrap gap-2">
                        <button type="button" className={riskActionClass} onClick={() => void updateLabel("genuine")}>Mark genuine</button>
                        <button type="button" className={riskActionClass} onClick={() => void updateLabel("fake")}>Mark fake</button>
                        <button type="button" className={riskActionClass} onClick={() => void blockIdentity("phone")}>Block phone</button>
                        <button type="button" className={riskActionClass} onClick={() => void blockIdentity("device")}>Block device</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.article>
            );
          })}
        </div>
      )}

      {attempts.length >= 50 && !loading && (
        <button type="button" className={riskActionClass} onClick={() => { setBefore(attempts.at(-1)?.created_at); setSelected(null); }}>
          Older attempts
        </button>
      )}
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

export function RiskSettingsPanel() {
  const [settings, setSettings] = useState<RiskSettings | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

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

  return (
    <form
      className="max-w-3xl space-y-4 p-4 sm:p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError("");
        setMessage("");
        try {
          const saved = await updateRiskSettings(settings);
          setSettings(saved);
          setMessage("Settings saved");
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setSaving(false);
        }
      }}
    >
      <section className="rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5" aria-labelledby="risk-mode-heading">
        <h2 id="risk-mode-heading" className={riskLabelClass}>Protection mode</h2>
        <p className="mt-1 text-xs text-black/55">Choose whether risk decisions are observed only or enforced at checkout.</p>
        <label className="mt-4 block">
          <span className="sr-only">Protection mode</span>
          <select
            className="block w-full rounded-lg border border-black/15 bg-transparent p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-black"
            value={settings.mode}
            onChange={(event) => setSettings({ ...settings, mode: event.target.value as RiskSettings["mode"] })}
          >
            <option value="off">Off</option>
            <option value="shadow">Shadow · observe only</option>
            <option value="active">Active · enforce decisions</option>
          </select>
        </label>
      </section>

      <section className="rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5" aria-labelledby="risk-districts-heading">
        <h2 id="risk-districts-heading" className={riskLabelClass}>Districts requiring review</h2>
        <p className="mt-1 text-xs text-black/55">Select districts where incomplete or unfamiliar checkout context should be held for review.</p>
        <div className="mt-4 grid max-h-48 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
          {settings.districtOptions.map((district) => (
            <label key={district.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-xs text-black/75">
              <input
                type="checkbox"
                checked={settings.haterDistrictIds.includes(district.id)}
                onChange={(event) => setSettings({
                  ...settings,
                  haterDistrictIds: event.target.checked
                    ? [...settings.haterDistrictIds, district.id]
                    : settings.haterDistrictIds.filter((id) => id !== district.id),
                })}
              />
              {district.name}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5" aria-labelledby="risk-terms-heading">
        <h2 id="risk-terms-heading" className={riskLabelClass}>Additional abuse terms</h2>
        <p className="mt-1 text-xs text-black/55">Add one term per line for product or checkout language that should increase review.</p>
        <textarea
          aria-label="Additional abuse terms"
          className="mt-4 min-h-28 w-full rounded-lg border border-black/15 bg-transparent p-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-black"
          rows={4}
          value={settings.extraAbuseTerms.join("\n")}
          onChange={(event) => setSettings({ ...settings, extraAbuseTerms: event.target.value.split("\n").map((term) => term.trim()).filter(Boolean) })}
        />
      </section>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-lime-50 px-3 py-2 text-sm text-lime-900">{message}</p>}
      <button type="submit" className={riskActionClass} disabled={saving}>
        {saving ? <><Spinner size="sm" className="mr-2 inline-flex" /> Saving…</> : "Save settings"}
      </button>
    </form>
  );
}
