import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { addRiskListEntry, deleteRiskListEntry, fetchRiskAccuracy, fetchRiskAttempt, fetchRiskAttempts, fetchRiskLists, fetchRiskSettings, labelRiskAttempt, updateRiskSettings, type RiskAccuracy, type RiskAttempt, type RiskListEntry, type RiskSettings, type RiskSignal } from "@/lib/orderRisk";

const labelClass = "text-[8px] font-medium tracking-[0.3em] text-black uppercase";
const buttonClass = "rounded-lg border border-black/15 px-3 py-2 text-xs hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black";
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Request failed";

export function RiskSignalChips({ signals }: { signals: RiskSignal[] }) {
  return <ul className="flex flex-wrap gap-2">{signals.map(signal => <li key={signal.code} className="border border-black/10 px-2 py-1 text-xs" title={signal.evidence}>
    {signal.label ?? signal.code} <span className="text-black/45">{signal.points > 0 ? "+" : ""}{signal.points}</span>
  </li>)}</ul>;
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
export function reasonLabel(reason: string) {
  if (REASON_LABELS[reason]) return REASON_LABELS[reason];
  if (reason.startsWith("critical:")) return `Critical signal: ${reason.slice("critical:".length)}`;
  if (reason.startsWith("score>=")) return `High risk score (${reason.slice("score".length)})`;
  return reason;
}

export function RiskDetails({ attempt, related = [] }: { attempt: RiskAttempt; related?: RiskAttempt[] }) {
  return <div className="space-y-5 text-sm">
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div><p className={labelClass}>Decision</p><p className="text-2xl font-light">{attempt.decision}</p></div>
      <div><p className={labelClass}>Score</p><p className="text-2xl font-light">{attempt.score}</p></div>
      <div><p className={labelClass}>Mode</p><p>{attempt.mode === "shadow" ? "Shadow · not enforced" : "Active"}</p></div>
      <div><p className={labelClass}>Context</p><p>{attempt.context_trusted ? "Signed" : "Unverified"}</p></div>
    </div>
    <div><p className={labelClass}>Customer</p><p>{attempt.customer_name || "Unknown"} · {attempt.phone || "No phone"}</p><p>{attempt.address}</p></div>
    <div><p className={labelClass}>Why</p><RiskSignalChips signals={attempt.signals || []} />
      {(attempt.reasons || []).length > 0 && <ul className="mt-2 list-disc pl-5 text-black" aria-label="Decision reasons">{(attempt.reasons || []).map(reason => <li key={reason}>{reasonLabel(reason)}</li>)}</ul>}
      <ul className="mt-2 list-disc pl-5 text-black/60">{(attempt.signals || []).map(signal => <li key={signal.code}>{signal.evidence}</li>)}</ul>
    </div>
    <div><p className={labelClass}>Network & device</p><p>{attempt.network_type || "Unknown network"} · {attempt.geo_city || "Unknown city"} · {attempt.user_agent_summary || "Unknown browser"}</p></div>
    {attempt.order_id && <Link className="underline" to={`/orders/${attempt.order_id}`}>Open order</Link>}
    {attempt.review_id && <p>Held review: {attempt.review_id}</p>}
    <div><p className={labelClass}>Related attempts · last 7 days</p>{related.length ? <ul>{related.map(row => <li key={row.id}>{row.created_at} · {row.decision} · {row.score}</li>)}</ul> : <p className="text-black/50">No linked attempts</p>}</div>
  </div>;
}

export function RiskAttemptsPanel() {
  const [decision, setDecision] = useState("all");
  const [attempts, setAttempts] = useState<RiskAttempt[]>([]);
  const [selected, setSelected] = useState<RiskAttempt | null>(null);
  const [related, setRelated] = useState<RiskAttempt[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [before, setBefore] = useState<string | undefined>();
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRiskAttempts({ decision, before }).then(({ attempts: rows }) => { if (!cancelled) setAttempts(rows); })
      .catch(err => { if (!cancelled) setError(errorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [decision, before]);
  async function openAttempt(id: string) {
    try {
      const detail = await fetchRiskAttempt(id);
      setSelected(detail.attempt); setRelated(detail.related); setError("");
    } catch (err) { setError(errorMessage(err)); }
  }
  return <div className="space-y-4">
    <div className="flex items-center gap-3"><label htmlFor="risk-decision" className={labelClass}>Decision</label>
      <select id="risk-decision" className="border border-black/15 bg-transparent p-2 text-sm" value={decision} onChange={event => { setDecision(event.target.value); setBefore(undefined); }}>
        <option value="all">All</option><option value="allow">Allowed</option><option value="hold">Held</option><option value="block">Blocked</option>
      </select></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading ? <p>Loading attempts…</p> : attempts.length === 0 ? <p className="text-black/50">No attempts found.</p> : <div className="divide-y divide-black/10">{attempts.map(row => <button key={row.id} type="button" onClick={() => void openAttempt(row.id)} className="flex w-full flex-wrap items-center justify-between gap-3 py-3 text-left hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black" aria-label={`${row.customer_name || "Unknown"} ${row.decision} ${row.score}`}>
      <span><span className="block text-sm">{row.customer_name || "Unknown"} · {row.phone || "No phone"}</span><span className="text-xs text-black/50">{new Date(row.created_at).toLocaleString()} · {row.mode === "shadow" ? "Shadow" : "Active"}</span></span>
      <RiskSignalChips signals={row.topSignals || []} /><span className="text-sm">{row.decision} · {row.score}</span>
    </button>)}</div>}
    {attempts.length >= 50 && <button className={buttonClass} onClick={() => { setBefore(attempts.at(-1)?.created_at); setSelected(null); }}>Older attempts</button>}
    {selected && <section aria-label="Attempt details" className="border-t border-black/10 pt-5"><div className="mb-4 flex justify-between"><h2 className="text-lg font-light">Investigation</h2><button className={buttonClass} onClick={() => setSelected(null)}>Close</button></div><RiskDetails attempt={selected} related={related} />
      <div className="mt-5 flex flex-wrap gap-2"><button className={buttonClass} onClick={async () => { try { const result = await labelRiskAttempt(selected.id, "genuine"); setSelected(result.attempt); setError(""); } catch (err) { setError(errorMessage(err)); } }}>Mark genuine</button><button className={buttonClass} onClick={async () => { try { const result = await labelRiskAttempt(selected.id, "fake"); setSelected(result.attempt); setError(""); } catch (err) { setError(errorMessage(err)); } }}>Mark fake</button>{(["phone", "device"] as const).map(kind => <button className={buttonClass} key={kind} onClick={async () => { const reason = window.prompt(`Reason to block ${kind} (required)`); if (!reason?.trim()) return; try { await addRiskListEntry(selected.id, "block", [kind], reason); setError(""); } catch (err) { setError(errorMessage(err)); } }}>Block {kind}</button>)}</div>
    </section>}
  </div>;
}

const formatRatio = (value: number | null) => value === null ? "Not enough labels" : `${(value * 100).toFixed(1)}%`;
export function RiskAccuracyPanel() {
  const [days, setDays] = useState<7 | 30>(7);
  const [accuracy, setAccuracy] = useState<RiskAccuracy | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let cancelled = false; fetchRiskAccuracy(days).then(value => { if (!cancelled) setAccuracy(value); }).catch(err => { if (!cancelled) setError(errorMessage(err)); }); return () => { cancelled = true; }; }, [days]);
  if (error) return <p role="alert">{error}</p>;
  return <div className="space-y-6"><div className="flex gap-2">{([7, 30] as const).map(value => <button key={value} className={buttonClass} aria-pressed={days === value} onClick={() => { setDays(value); setAccuracy(null); }}>{value} days</button>)}</div>
    {!accuracy ? <p>Loading accuracy…</p> : <><p className="text-xs text-black/50">{accuracy.overall.attempts} assessments · {accuracy.overall.labelledFake + accuracy.overall.labelledGenuine} labeled outcomes. Shadow decisions are included.</p>
      <div className="grid gap-5 sm:grid-cols-3">{([ ["Hold rate", accuracy.overall.holdRate], ["Block precision", accuracy.overall.blockPrecision], ["Fake caught", accuracy.overall.fakeCaught] ] as const).map(([title, value]) => <div key={title}><p className={labelClass}>{title}</p><p className="text-2xl font-light">{formatRatio(value)}</p></div>)}</div>
      <p className="text-xs">Genuine customers held: {accuracy.overall.heldGenuine} · blocked: {accuracy.overall.blockedGenuine} · fake orders missed: {accuracy.overall.fakeSlipped}</p>
      <div><h3 className={labelClass}>Signal accuracy</h3>{accuracy.signals.length ? <ul className="mt-2 divide-y divide-black/10">{accuracy.signals.filter(row => row.fired).map(row => <li key={row.code} className="flex justify-between py-2 text-xs"><span>{row.code} · {row.fired} fired</span><span>{formatRatio(row.precisionFake)} confirmed fake</span></li>)}</ul> : <p className="text-sm text-black/50">No signals recorded in this period.</p>}</div>
    </>}
  </div>;
}

export function RiskListsPanel() {
  const [list, setList] = useState<"block" | "allow">("block");
  const [entries, setEntries] = useState<RiskListEntry[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { let cancelled = false; fetchRiskLists(list).then(result => { if (!cancelled) setEntries(result.entries); }).catch(err => { if (!cancelled) setError(errorMessage(err)); }); return () => { cancelled = true; }; }, [list]);
  return <div className="space-y-4"><div className="flex gap-2">{(["block", "allow"] as const).map(value => <button key={value} className={buttonClass} aria-pressed={list === value} onClick={() => setList(value)}>{value === "block" ? "Blocklist" : "Allowlist"}</button>)}</div>
    {error && <p role="alert">{error}</p>}
    {entries.length ? <ul className="divide-y divide-black/10">{entries.map(entry => <li key={entry.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{entry.kind} · {entry.display_hint || "Identity"}<span className="block text-xs text-black/50">{entry.reason || "No reason"}</span></span><button className={buttonClass} onClick={async () => { try { await deleteRiskListEntry(entry.id); setEntries(current => current.filter(row => row.id !== entry.id)); } catch (err) { setError(errorMessage(err)); } }}>Remove</button></li>)}</ul> : <p className="text-black/50">No entries.</p>}
  </div>;
}

export function RiskSettingsPanel() {
  const [settings, setSettings] = useState<RiskSettings | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { let cancelled = false; fetchRiskSettings().then(value => { if (!cancelled) setSettings(value); }).catch(err => { if (!cancelled) setError(errorMessage(err)); }); return () => { cancelled = true; }; }, []);
  if (!settings) return <p>{error || "Loading settings…"}</p>;
  return <form className="max-w-xl space-y-5" onSubmit={async event => { event.preventDefault(); try { const saved = await updateRiskSettings(settings); setSettings(saved); setMessage("Settings saved"); setError(""); } catch (err) { setError(errorMessage(err)); } }}>
    <label className="block"><span className={labelClass}>Protection mode</span><select className="mt-2 block w-full border border-black/15 bg-transparent p-2" value={settings.mode} onChange={event => setSettings({ ...settings, mode: event.target.value as RiskSettings["mode"] })}><option value="off">Off</option><option value="shadow">Shadow · observe only</option><option value="active">Active · enforce decisions</option></select></label>
    <fieldset><legend className={labelClass}>Districts requiring review</legend><div className="mt-2 grid max-h-48 grid-cols-2 gap-2 overflow-y-auto">{settings.districtOptions.map(district => <label key={district.id} className="text-xs"><input type="checkbox" checked={settings.haterDistrictIds.includes(district.id)} onChange={event => setSettings({ ...settings, haterDistrictIds: event.target.checked ? [...settings.haterDistrictIds, district.id] : settings.haterDistrictIds.filter(id => id !== district.id) })} /> {district.name}</label>)}</div></fieldset>
    <label className="block"><span className={labelClass}>Additional abuse terms · one per line</span><textarea className="mt-2 w-full border border-black/15 bg-transparent p-2 text-sm" rows={4} value={settings.extraAbuseTerms.join("\n")} onChange={event => setSettings({ ...settings, extraAbuseTerms: event.target.value.split("\n").map(term => term.trim()).filter(Boolean) })} /></label>
    {error && <p role="alert" className="text-red-700">{error}</p>}{message && <p role="status">{message}</p>}
    <button className={buttonClass} type="submit">Save settings</button>
  </form>;
}
