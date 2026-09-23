import { apiFetch } from "@/lib/api";

export type RiskSignal = { code: string; family: string; severity: string; points: number; label?: string; evidence?: string };
export type RiskAttempt = {
  id: string; created_at: string; route: string; mode: "shadow" | "active";
  decision: "ALLOW" | "HOLD" | "BLOCK"; score: number;
  customer_name: string | null; phone: string | null; address?: string | null;
  signals: RiskSignal[]; reasons: string[]; label: "fake" | "genuine" | null;
  topSignals?: RiskSignal[];
  context_trusted: boolean; order_id: string | null; review_id: string | null;
  network_type?: string | null; geo_city?: string | null; user_agent_summary?: string | null;
  items?: Array<Record<string, unknown>>;
};

// Turnstile is not live on the storefront yet, so attempts recorded before the
// detector was narrowed carry a meaningless "bot check failed" signal.
const HIDDEN_RISK_SIGNAL_CODES = new Set(["bot_check_failed"]);
export const isVisibleRiskSignal = (code: string) => !HIDDEN_RISK_SIGNAL_CODES.has(code);
export const visibleRiskSignals = <T extends { code: string }>(signals: T[]) => signals.filter((signal) => isVisibleRiskSignal(signal.code));
export type RiskListEntry = { id: string; list: "block" | "allow"; kind: string; display_hint: string | null; reason: string | null; created_at: string; expires_at: string | null };
export type RiskSettings = { mode: "off" | "shadow" | "active"; haterDistrictIds: string[]; extraAbuseTerms: string[]; districtOptions: Array<{ id: string; name: string }> };
export type RiskAccuracy = { overall: { attempts: number; holds: number; blocks: number; holdRate: number | null; labelledFake: number; labelledGenuine: number; blockPrecision: number | null; blockedGenuine: number; heldGenuine: number; fakeCaught: number | null; fakeSlipped: number; targets: Record<string, { value: number | null; target: number; pass: boolean | null }> }; signals: Array<{ code: string; fired: number; fake: number; genuine: number; precisionFake: number | null }> };

async function read<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Request failed");
  return payload as T;
}

export async function fetchRiskAttempts({ decision = "all", limit = 50, before }: { decision?: string; limit?: number; before?: string } = {}) {
  const params = new URLSearchParams({ decision, limit: String(limit) });
  if (before) params.set("before", before);
  return read<{ attempts: RiskAttempt[] }>(await apiFetch(`/api/order-protection/attempts?${params}`));
}
export async function fetchRiskAttempt(id: string) {
  return read<{ attempt: RiskAttempt; related: RiskAttempt[]; review: unknown; order: { id: string; order_number: string } | null }>(await apiFetch(`/api/order-protection/attempts/${encodeURIComponent(id)}`));
}
export async function fetchOrderRisk(id: string) {
  return read<{ attempt: RiskAttempt | null }>(await apiFetch(`/api/orders/${encodeURIComponent(id)}/risk`));
}
export async function fetchRiskLists(list: "block" | "allow") {
  return read<{ entries: RiskListEntry[] }>(await apiFetch(`/api/order-protection/lists?list=${list}`));
}
export async function fetchRiskSettings() {
  return read<RiskSettings>(await apiFetch("/api/order-protection/settings"));
}
export async function fetchRiskAccuracy(days: 7 | 30 = 7) {
  return read<RiskAccuracy>(await apiFetch(`/api/order-protection/accuracy?days=${days}`));
}
export async function labelRiskAttempt(id: string, label: "fake" | "genuine") {
  return read<{ attempt: RiskAttempt }>(await apiFetch(`/api/order-protection/attempts/${encodeURIComponent(id)}/label`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) }));
}
export async function updateRiskSettings(settings: Pick<RiskSettings, "mode" | "haterDistrictIds" | "extraAbuseTerms">) {
  return read<RiskSettings>(await apiFetch("/api/order-protection/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) }));
}
export async function addRiskListEntry(attemptId: string, list: "block" | "allow", kinds: string[], reason: string) {
  return read<{ entries: RiskListEntry[] }>(await apiFetch("/api/order-protection/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId, list, kinds, reason }) }));
}
export async function deleteRiskListEntry(id: string) {
  return read<{ success: boolean }>(await apiFetch(`/api/order-protection/lists/${encodeURIComponent(id)}`, { method: "DELETE" }));
}
