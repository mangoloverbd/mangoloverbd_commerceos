# Order Risk Engine v2 — Risk Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Mango Lover BD staff an explainable risk dashboard, linked investigation view, list controls, order Risk tab, and protection settings.

**Architecture:** Serialize persisted attempts through a pure server module and expose org-guarded staff APIs in the existing Order Protection route section. A typed `apiFetch`/TanStack Query client feeds reusable risk detail content in a Sheet and inline order tab; the existing held-review queue remains the default dashboard view.

**Tech Stack:** Node 20 ESM Express, Supabase service client, React 18, TypeScript, TanStack Query v5, shadcn/ui, Phosphor Icons, Vitest and Testing Library.

## Global Constraints

- Read `00-overview.md` §§5, 10, 12 and the design spec §11 before execution. Plans C and D must be merged first.
- Single tenant: every query on user data filters by the resolved Mango Lover BD `org_id`; never accept an org id from a client.
- Every new authenticated route: `requireOrderProtectionStaff(req)` → `if (!user) return 401`; mutations additionally require `role === "admin"` (403 otherwise).
- New server routes go in `server/index.js` in the `// ─── Order Protection Review Queue` section; pure logic goes in `server/risk/*.js` (ESM, no default exports).
- Identifiers (phone, device ID, fingerprint, network key, IP, user agent) are stored only as `hashProtectionSignal(value, process.env.ORDER_PROTECTION_HASH_SECRET)` except the explicitly listed display columns in `order_risk_attempts`. Never log raw phone, address, IP, device ID, or user agent.
- Always `normalizeBdPhone()` before using a phone; valid BD mobile = `^01[3-9]\d{8}$`. No AI calls anywhere in the checkout path. Dependency failure ⇒ HOLD, never BLOCK.
- UI: `#FAFAF8` warm background, borderless content, label `text-[8px] font-medium tracking-[0.3em] text-black uppercase`, value `text-2xl font-light`, Phosphor icons with `weight="light"`, `৳`, shadcn/ui, `apiFetch()` only. Existing `src/pages/OrderProtection.tsx` and `OrderProtectionReviewQueue.tsx` are the visual baseline.
- Merchant Suite tests: `src/test/*.test.ts(x)`, `npx vitest run <file>`; import server modules as `../../server/...js`. Final checks: `npm test`, `npm run lint`, `npm run build`.
- Do not apply remote migrations, change production env vars, deploy, or submit a real order. Commits use imperative `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`; one commit per task minimum. Preserve unrelated working-tree edits, especially `server/index.js`.

## File map and execution order

| File | Responsibility |
|---|---|
| `server/risk/serialize.js` | Pure summary/detail projection and masked list hints |
| `server/index.js` | Staff API routes, scoped lookups, validation and settings persistence |
| `src/lib/orderRisk.ts` | Contract types, authenticated clients, query hooks and invalidation |
| `src/components/risk/RiskSignalChips.tsx` | Severity-sorted, evidence-accessible chips |
| `src/components/risk/RiskDetailsContent.tsx`, `RiskDetailsDrawer.tsx` | Shared details body and Sheet/actions |
| `src/components/risk/RiskAttemptsTable.tsx`, `RiskListsPanel.tsx` | Paginated attempts and managed lists |
| `src/pages/OrderProtection.tsx`, `src/components/OrderProtectionReviewQueue.tsx`, `src/lib/orderProtection.ts` | Tab shell and held-review details affordance |
| `src/hooks/useOrderEditorTab.ts`, `src/components/order-editor/OrderEditorTabs.tsx`, `src/pages/OrderDetail.tsx` | Website-order Risk tab beside Details/Logs |
| `src/components/settings/OrderProtectionSettings.tsx`, `src/pages/Settings.tsx` | Admin-only workspace settings |

For each task, make the test fail for the specified behavior first. Code below is the implementation skeleton to type in full; use existing import placement and formatting. Run focused tests after each implementation and commit only that task’s files.

### Task 1: Serialize safe attempt views and list hints

**Files:** Create `server/risk/serialize.js`; test `src/test/orderRiskSerialize.test.ts`.

**Interfaces:** Consumes Plan C `order_risk_attempts` row and Plan D `Signal`. Produces `toAttemptSummary(row)`, `toAttemptDetail(row)`, `buildDisplayHint(kind, attempt)`; both serializers are pure and never return a `*_hash` field.

- [ ] **Step 1: Write the failing test** in `src/test/orderRiskSerialize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDisplayHint, toAttemptDetail, toAttemptSummary } from "../../server/risk/serialize.js";

const row = {
  id: "a", org_id: "o", created_at: "2026-09-23T10:00:00Z", decision: "BLOCK", score: 100, mode: "active",
  customer_name: "Mina", phone: "01712345448", address: "Rajshahi", parsed_district: "Rajshahi", total: 800,
  order_id: null, review_id: null, label: null, phone_hash: "p".repeat(64), device_hash: "abcdef123456",
  fingerprint_hash: "123456789abc", network_hash: "fedcba987654", ip_hash: "i".repeat(64), user_agent_hash: "u".repeat(64),
  ip_prefix: "103.12.44.0/24", signals: [
    { code: "low", family: "CONTENT", severity: "low", points: 10, label: "Low", evidence: "A low signal" },
    { code: "trust", family: "HISTORY", severity: "trust", points: -15, label: "Trust", evidence: "A trust signal" },
    { code: "high", family: "DEVICE", severity: "high", points: 40, label: "High", evidence: "A high signal" },
    { code: "critical", family: "LIST", severity: "critical", points: 100, label: "Critical", evidence: "A critical signal" },
  ],
};

describe("risk serialization", () => {
  it("returns severity-ranked summaries without hashes", () => {
    const result = toAttemptSummary(row);
    expect(result.topSignals.map((s: { code: string }) => s.code)).toEqual(["critical", "high", "low"]);
    expect(result).toMatchObject({ id: "a", phone: "01712345448", parsed_district: "Rajshahi", total: 800 });
    expect(JSON.stringify(result)).not.toContain(row.device_hash);
  });
  it("shortens only allowed detail identities and masks list hints", () => {
    const detail = toAttemptDetail(row);
    expect(detail).toMatchObject({ deviceShortId: "abcdef12", fingerprintShortId: "12345678", networkShortId: "fedcba98" });
    expect(JSON.stringify(detail)).not.toContain(row.phone_hash);
    expect(buildDisplayHint("phone", row)).toBe("017•••••448");
    expect(buildDisplayHint("device", row)).toBe("Device abcdef");
    expect(buildDisplayHint("fingerprint", row)).toBe("Browser 123456");
    expect(buildDisplayHint("network", row)).toBe("103.12.44.0/24");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/orderRiskSerialize.test.ts`; expected FAIL: missing module.
- [ ] **Step 3: Implement** `server/risk/serialize.js`:

```js
const rank = { critical: 0, high: 1, medium: 2, low: 3, trust: 4 };
const hashColumns = new Set(["phone_hash", "device_hash", "fingerprint_hash", "network_hash", "ip_hash", "user_agent_hash"]);
const sortSignals = (signals) => [...(Array.isArray(signals) ? signals : [])].sort((a, b) => (rank[a.severity] ?? 5) - (rank[b.severity] ?? 5));
const short = (value, length) => typeof value === "string" ? value.slice(0, length) : null;

export function toAttemptSummary(row) {
  const { id, created_at, decision, score, mode, customer_name, phone, parsed_district, total, order_id, review_id, label } = row;
  return { id, created_at, decision, score, mode, topSignals: sortSignals(row.signals).slice(0, 3), customer_name, phone, parsed_district, total, order_id, review_id, label };
}

export function toAttemptDetail(row) {
  const safe = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "org_id" && !hashColumns.has(key) && !key.endsWith("_hash")));
  return { ...safe, deviceShortId: short(row.device_hash, 8), networkShortId: short(row.network_hash, 8), fingerprintShortId: short(row.fingerprint_hash, 8) };
}

export function buildDisplayHint(kind, attempt) {
  if (kind === "phone") return typeof attempt.phone === "string" && attempt.phone.length >= 6
    ? `${attempt.phone.slice(0, 3)}•••••${attempt.phone.slice(-3)}` : null;
  if (kind === "device") return attempt.device_hash ? `Device ${short(attempt.device_hash, 6)}` : null;
  if (kind === "fingerprint") return attempt.fingerprint_hash ? `Browser ${short(attempt.fingerprint_hash, 6)}` : null;
  if (kind === "network") return attempt.ip_prefix ?? (attempt.network_hash ? `Network ${short(attempt.network_hash, 6)}` : null);
  return null;
}
```

- [ ] **Step 4: Run** `npx vitest run src/test/orderRiskSerialize.test.ts`; expected PASS.
- [ ] **Step 5: Commit** `git add server/risk/serialize.js src/test/orderRiskSerialize.test.ts && git commit -m "feat: serialize order risk attempts for staff"`.

### Task 2: Add authenticated, scoped dashboard and settings API

**Files:** Modify `server/index.js` imports and Order Protection section (around line 12674); test `src/test/orderRiskDashboardRoutes.test.ts`.

**Interfaces:** Consumes Plan C `listRiskAttempts(supabase,{orgId,decision,limit,before})`, `getRiskAttempt(supabase,{orgId,attemptId})`, `listRelatedAttempts(supabase,{orgId,attempt,days,limit})`, `createListEntries(supabase,{orgId,list,entries,reason,sourceAttemptId,createdBy})`, `listListEntries(supabase,{orgId,list})`, `deleteListEntry(supabase,{orgId,entryId})`; existing `getProtectionReview({supabase,orgId,reviewId})`, `getSettings`, `saveSettings`, `requireOrderProtectionStaff`, `sendError`; Task 1 serializers. Produces the exact §12 GET attempts/detail/order risk, GET/POST/DELETE lists and GET/PUT settings endpoints. Plan F owns label and accuracy routes.

- [ ] **Step 1: Write a failing source-wiring test** in `src/test/orderRiskDashboardRoutes.test.ts` (assert each route body, not a distant coincidental guard):

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const route = (method: string, path: string) => {
  const start = source.indexOf(`app.${method}("${path}"`);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("\napp.", start + 5);
  return source.slice(start, next < 0 ? undefined : next);
};
describe("risk dashboard routes", () => {
  const paths = [
    ["get", "/api/order-protection/attempts"], ["get", "/api/order-protection/attempts/:id"],
    ["get", "/api/orders/:id/risk"], ["get", "/api/order-protection/lists"],
    ["post", "/api/order-protection/lists"], ["delete", "/api/order-protection/lists/:id"],
    ["get", "/api/order-protection/settings"], ["put", "/api/order-protection/settings"],
  ];
  it.each(paths)("guards %s %s with staff auth", (method, path) => {
    const body = route(method, path);
    expect(body).toContain("requireOrderProtectionStaff(req)");
    expect(body).toContain('if (!user) return res.status(401)');
    expect(body).toContain("orgId");
  });
  it.each(paths.filter(([method]) => method === "post" || method === "put" || method === "delete"))
    ("limits %s %s to admins", (method, path) => expect(route(method, path)).toContain('role !== "admin"'));
  it("scopes direct lookups to the org", () => {
    expect(route("get", "/api/order-protection/attempts/:id")).toContain("getRiskAttempt(supabase, { orgId");
    expect(route("get", "/api/orders/:id/risk")).toContain('.eq("org_id", orgId)');
    expect(route("delete", "/api/order-protection/lists/:id")).toContain("deleteListEntry(supabase, { orgId");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/orderRiskDashboardRoutes.test.ts`; expected FAIL: missing routes.
- [ ] **Step 3: Add imports** near existing protection imports and the following routes directly after `app.patch("/api/order-protection/reviews/:id", ...)` and before public checkout. Use actual Plan C signatures exactly:

```js
import { getProtectionReview } from "./orderProtectionStore.js";
import { listRiskAttempts, getRiskAttempt, listRelatedAttempts, createListEntries, listListEntries, deleteListEntry } from "./risk/store.js";
import { toAttemptSummary, toAttemptDetail, buildDisplayHint } from "./risk/serialize.js";
import bdLocations from "./risk/dictionaries/bdLocations.json" with { type: "json" };
import { resolveProtectionMode } from "./risk/mode.js";
```

```js
const districtOptions = bdLocations.districts.map((d) => ({
  id: String(d.id), name: d.name, bnName: d.bn,
  divisionName: bdLocations.divisions.find((division) => String(division.id) === String(d.divisionId))?.name ?? "",
}));
const validDistrictIds = new Set(districtOptions.map((d) => d.id));
const riskSettingKeys = (orgId) => ({ mode: `${orgId}:order_protection_mode`, districts: `${orgId}:order_protection_hater_districts`, terms: `${orgId}:order_protection_extra_abuse_terms` });
function parseRiskArray(value, fallback) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : fallback; } catch { return fallback; }
}
function riskSettings(orgId, values) {
  const keys = riskSettingKeys(orgId);
  return {
    mode: resolveProtectionMode({ envMode: process.env.ORDER_PROTECTION_MODE, settingMode: values[keys.mode] }),
    haterDistrictIds: parseRiskArray(values[keys.districts], ["15", "16", "18", "19"]),
    extraAbuseTerms: parseRiskArray(values[keys.terms], []), districtOptions,
  };
}
const badRiskRequest = (res, message) => res.status(400).json({ error: message });

app.get("/api/order-protection/attempts", async (req, res) => {
  try {
    const { user, supabase, orgId } = await requireOrderProtectionStaff(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const decision = String(req.query.decision ?? "all").toLowerCase();
    const limit = Number(req.query.limit ?? 50);
    const before = req.query.before ?? null;
    if (!["hold", "block", "allow", "all"].includes(decision) || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
        (before !== null && (typeof before !== "string" || !Number.isFinite(Date.parse(before))))) return badRiskRequest(res, "Invalid attempt filters");
    const attempts = await listRiskAttempts(supabase, { orgId, decision, limit, before });
    return res.json({ attempts: attempts.map(toAttemptSummary) });
  } catch (error) { return sendError(res, error); }
});

app.get("/api/order-protection/attempts/:id", async (req, res) => {
  try {
    const { user, supabase, orgId } = await requireOrderProtectionStaff(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const attempt = await getRiskAttempt(supabase, { orgId, attemptId: req.params.id });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    const [related, review, orderResult] = await Promise.all([
      listRelatedAttempts(supabase, { orgId, attempt, days: 7, limit: 50 }),
      attempt.review_id ? getProtectionReview({ supabase, orgId, reviewId: attempt.review_id }) : null,
      attempt.order_id ? supabase.from("orders").select("id, order_number, status, courier_status")
        .eq("org_id", orgId).eq("id", attempt.order_id).maybeSingle() : null,
    ]);
    if (orderResult?.error) throw orderResult.error;
    return res.json({ attempt: toAttemptDetail(attempt), related: related.map(toAttemptSummary), review, order: orderResult?.data ?? null });
  } catch (error) { return sendError(res, error); }
});

app.get("/api/orders/:id/risk", async (req, res) => {
  try {
    const { user, supabase, orgId } = await requireOrderProtectionStaff(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { data: order, error } = await supabase.from("orders").select("id, risk_attempt_id").eq("org_id", orgId).eq("id", req.params.id).maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ error: "Order not found" });
    const attempt = order.risk_attempt_id ? await getRiskAttempt(supabase, { orgId, attemptId: order.risk_attempt_id }) : null;
    return res.json({ attempt: attempt ? toAttemptDetail(attempt) : null });
  } catch (error) { return sendError(res, error); }
});

app.get("/api/order-protection/lists", async (req, res) => {
  try {
    const { user, supabase, orgId } = await requireOrderProtectionStaff(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const list = req.query.list ?? "block";
    if (list !== "block" && list !== "allow") return badRiskRequest(res, "Invalid list");
    const entries = await listListEntries(supabase, { orgId, list });
    return res.json({ entries: entries.map(({ value_hash, org_id, ...safe }) => safe) });
  } catch (error) { return sendError(res, error); }
});

app.post("/api/order-protection/lists", async (req, res) => {
  try {
    const { user, supabase, orgId, role } = await requireOrderProtectionStaff(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const { attemptId, list, kinds, reason } = req.body ?? {};
    const validKinds = new Set(["phone", "device", "fingerprint", "network"]);
    if (typeof attemptId !== "string" || !["block", "allow"].includes(list) || !Array.isArray(kinds) || !kinds.length ||
        kinds.some((kind) => !validKinds.has(kind)) || typeof reason !== "string" || reason.trim().length === 0 || reason.trim().length > 200)
      return badRiskRequest(res, "Invalid list entry");
    const attempt = await getRiskAttempt(supabase, { orgId, attemptId });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    const columns = { phone: "phone_hash", device: "device_hash", fingerprint: "fingerprint_hash", network: "network_hash" };
    const entries = [...new Set(kinds)].filter((kind) => attempt[columns[kind]]).map((kind) => ({
      kind, valueHash: attempt[columns[kind]], displayHint: buildDisplayHint(kind, attempt),
      expiresAt: kind === "network" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
    }));
    if (!entries.length) return badRiskRequest(res, "No available identities for these kinds");
    const created = await createListEntries(supabase, { orgId, list, entries, reason: reason.trim(), sourceAttemptId: attempt.id, createdBy: user.id });
    return res.json({ entries: created.map(({ value_hash, org_id, ...safe }) => safe) });
  } catch (error) { return sendError(res, error); }
});

app.delete("/api/order-protection/lists/:id", async (req, res) => {
  try {
    const { user, supabase, orgId, role } = await requireOrderProtectionStaff(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const deleted = await deleteListEntry(supabase, { orgId, entryId: req.params.id });
    if (!deleted) return res.status(404).json({ error: "Entry not found" });
    return res.json({ success: true });
  } catch (error) { return sendError(res, error); }
});

app.get("/api/order-protection/settings", async (req, res) => {
  try {
    const { user, orgId } = await requireOrderProtectionStaff(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const keys = riskSettingKeys(orgId);
    return res.json(riskSettings(orgId, await getSettings(Object.values(keys))));
  } catch (error) { return sendError(res, error); }
});

app.put("/api/order-protection/settings", async (req, res) => {
  try {
    const { user, orgId, role } = await requireOrderProtectionStaff(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const { mode, haterDistrictIds, extraAbuseTerms } = req.body ?? {};
    if (!["off", "shadow", "active"].includes(mode) || !Array.isArray(haterDistrictIds) ||
        haterDistrictIds.some((id) => typeof id !== "string" || !validDistrictIds.has(id)) ||
        !Array.isArray(extraAbuseTerms) || extraAbuseTerms.length > 200 ||
        extraAbuseTerms.some((term) => typeof term !== "string" || !term.trim() || term.trim().length > 40))
      return badRiskRequest(res, "Invalid protection settings");
    const keys = riskSettingKeys(orgId);
    const updates = {
      [keys.mode]: mode,
      [keys.districts]: JSON.stringify([...new Set(haterDistrictIds)]),
      [keys.terms]: JSON.stringify([...new Set(extraAbuseTerms.map((term) => term.trim()))]),
    };
    const { error } = await saveSettings(updates);
    if (error) throw error;
    return res.json(riskSettings(orgId, { ...updates }));
  } catch (error) { return sendError(res, error); }
});
```

- [ ] **Step 4: Run** `npx vitest run src/test/orderRiskDashboardRoutes.test.ts src/test/orderProtectionReviewRoutes.test.ts`; expected PASS. Verify Plan C’s actual `createListEntries`/`deleteListEntry` return shapes before copying the route; keep the §10 store signatures unchanged.
- [ ] **Step 5: Commit** only this route diff and test: `git add server/index.js src/test/orderRiskDashboardRoutes.test.ts && git commit -m "feat: expose scoped order risk dashboard API"`. Before staging `server/index.js`, inspect and preserve the unrelated staged changes; use an isolated patch or coordinate with its owner rather than committing their edits.

### Task 3: Type the API and cache lifecycle

**Files:** Create `src/lib/orderRisk.ts`; test `src/test/orderRiskClient.test.tsx`.

**Interfaces:** Produces `RiskSignal`, `AttemptSummary`, `AttemptDetail`, `AttemptDetailResponse`, `RiskListEntry`, `RiskSettings`, `fetchRiskAttempts`, `fetchRiskAttempt`, `fetchOrderRisk`, `fetchRiskList`, `createRiskListEntries`, `deleteRiskListEntry`, `fetchRiskSettings`, `saveRiskSettings`, `useRiskAttempts`, `useRiskAttempt`, `useOrderRisk`, `useRiskList`, `useRiskSettings` and mutation hooks. Query-key prefix is `["order-risk", ...]`.

- [ ] **Step 1: Write the failing test** in `src/test/orderRiskClient.test.tsx`:

```tsx
import { expect, it, vi } from "vitest";
const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));
import { fetchRiskAttempts, createRiskListEntries } from "@/lib/orderRisk";
it("uses authenticated URLs and server-derived list identities", async () => {
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ attempts: [], entries: [] }) });
  await fetchRiskAttempts("block", "2026-09-23T10:00:00Z", 25);
  expect(apiFetch).toHaveBeenCalledWith("/api/order-protection/attempts?decision=block&limit=25&before=2026-09-23T10%3A00%3A00Z");
  await createRiskListEntries({ attemptId: "a", list: "block", kinds: ["device"], reason: "Called customer" });
  expect(apiFetch).toHaveBeenCalledWith("/api/order-protection/lists", expect.objectContaining({ method: "POST", body: JSON.stringify({ attemptId: "a", list: "block", kinds: ["device"], reason: "Called customer" }) }));
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/orderRiskClient.test.tsx`; expected FAIL: missing client.
- [ ] **Step 3: Implement** `src/lib/orderRisk.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { ProtectionReview } from "@/lib/orderProtection";

export type RiskDecision = "ALLOW" | "HOLD" | "BLOCK";
export type RiskKind = "phone" | "device" | "fingerprint" | "network";
export type RiskSignal = { code: string; family: "IDENTITY" | "DEVICE" | "NETWORK" | "BEHAVIOUR" | "CONTENT" | "LOCATION" | "HISTORY" | "LIST"; severity: "critical" | "high" | "medium" | "low" | "trust"; points: number; label: string; evidence: string };
export type AttemptSummary = { id: string; created_at: string; decision: RiskDecision; score: number; mode: "shadow" | "active"; topSignals: RiskSignal[]; customer_name: string | null; phone: string | null; parsed_district: string | null; total: number | null; order_id: string | null; review_id: string | null; label: "fake" | "genuine" | null };
export type AttemptDetail = Omit<AttemptSummary, "topSignals"> & { route: "public_v1" | "custom_webhook"; signals: RiskSignal[]; reasons: string[]; address: string | null; items: Array<Record<string, unknown>>; ip_prefix: string | null; network_type: string | null; geo_city: string | null; geo_region: string | null; geo_country: string | null; user_agent_summary: string | null; context_trusted: boolean; deviceShortId: string | null; networkShortId: string | null; fingerprintShortId: string | null; labelled_at: string | null; expires_at: string };
export type RiskOrderSummary = { id: string; order_number: string | number | null; status: string | null; courier_status: string | null };
export type AttemptDetailResponse = { attempt: AttemptDetail; related: AttemptSummary[]; review: ProtectionReview | null; order: RiskOrderSummary | null };
export type RiskListEntry = { id: string; list: "block" | "allow"; kind: RiskKind; display_hint: string | null; reason: string | null; source_attempt_id: string | null; created_by: string | null; created_at: string; expires_at: string | null };
export type RiskSettings = { mode: "off" | "shadow" | "active"; haterDistrictIds: string[]; extraAbuseTerms: string[]; districtOptions: Array<{ id: string; name: string; bnName: string; divisionName: string }> };
const root = "/api/order-protection";
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Risk request failed");
  return body as T;
}
const body = (value: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
export const fetchRiskAttempts = (decision: "hold" | "block" | "allow" | "all" = "all", before: string | null = null, limit = 50) =>
  json<{ attempts: AttemptSummary[] }>(`${root}/attempts?decision=${decision}&limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ""}`);
export const fetchRiskAttempt = (id: string) => json<AttemptDetailResponse>(`${root}/attempts/${encodeURIComponent(id)}`);
export const fetchOrderRisk = (orderId: string) => json<{ attempt: AttemptDetail | null }>(`/api/orders/${encodeURIComponent(orderId)}/risk`);
export const fetchRiskList = (list: "block" | "allow") => json<{ entries: RiskListEntry[] }>(`${root}/lists?list=${list}`);
export const createRiskListEntries = (value: { attemptId: string; list: "block" | "allow"; kinds: RiskKind[]; reason: string }) => json<{ entries: RiskListEntry[] }>(`${root}/lists`, body(value));
export const deleteRiskListEntry = (id: string) => json<{ success: true }>(`${root}/lists/${encodeURIComponent(id)}`, { method: "DELETE" });
export const fetchRiskSettings = () => json<RiskSettings>(`${root}/settings`);
export const saveRiskSettings = (value: Pick<RiskSettings, "mode" | "haterDistrictIds" | "extraAbuseTerms">) =>
  json<RiskSettings>(`${root}/settings`, { ...body(value), method: "PUT" });
export const useRiskAttempts = (decision: "hold" | "block" | "allow" | "all", before: string | null = null, limit = 50) =>
  useQuery({ queryKey: ["order-risk", "attempts", decision, before, limit], queryFn: () => fetchRiskAttempts(decision, before, limit) });
export const useRiskAttempt = (id: string | null) => useQuery({ queryKey: ["order-risk", "attempt", id], queryFn: () => fetchRiskAttempt(id!), enabled: Boolean(id) });
export const useOrderRisk = (orderId: string | null) => useQuery({ queryKey: ["order-risk", "order", orderId], queryFn: () => fetchOrderRisk(orderId!), enabled: Boolean(orderId) });
export const useRiskList = (list: "block" | "allow") => useQuery({ queryKey: ["order-risk", "lists", list], queryFn: () => fetchRiskList(list) });
export const useRiskSettings = () => useQuery({ queryKey: ["order-risk", "settings"], queryFn: fetchRiskSettings });
export function useCreateRiskListEntries() {
  const client = useQueryClient();
  return useMutation({ mutationFn: createRiskListEntries, onSuccess: () => client.invalidateQueries({ queryKey: ["order-risk"] }) });
}
export function useDeleteRiskListEntry() {
  const client = useQueryClient();
  return useMutation({ mutationFn: deleteRiskListEntry, onSuccess: () => client.invalidateQueries({ queryKey: ["order-risk", "lists"] }) });
}
export function useSaveRiskSettings() {
  const client = useQueryClient();
  return useMutation({ mutationFn: saveRiskSettings, onSuccess: () => client.invalidateQueries({ queryKey: ["order-risk", "settings"] }) });
}
```

- [ ] **Step 4: Run** `npx vitest run src/test/orderRiskClient.test.tsx`; expected PASS.
- [ ] **Step 5: Commit** `git add src/lib/orderRisk.ts src/test/orderRiskClient.test.tsx && git commit -m "feat: add typed order risk client"`.

### Task 4: Explain signal severity with accessible evidence

**Files:** Create `src/components/risk/RiskSignalChips.tsx`; test `src/test/riskSignalChips.test.tsx`.

**Interfaces:** Consumes `RiskSignal[]` from Task 3. Produces `<RiskSignalChips signals={signals} limit={2} />`; default shows all, stable sort critical → high → medium → low → trust, with keyboard/tap-accessible evidence.

- [ ] **Step 1: Write the failing test**:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { RiskSignalChips } from "@/components/risk/RiskSignalChips";
import type { RiskSignal } from "@/lib/orderRisk";
const signal = (severity: RiskSignal["severity"], label: string): RiskSignal => ({ code: label, family: "DEVICE", severity, points: 10, label, evidence: `${label} evidence` });
it("sorts signals, shows severity dots and exposes evidence", () => {
  render(<RiskSignalChips signals={[signal("trust", "Trusted"), signal("medium", "Medium"), signal("critical", "Critical")]} />);
  expect(screen.getAllByRole("button").map((node) => node.textContent)).toEqual(["Critical", "Medium", "Trusted"]);
  expect(screen.getByRole("button", { name: /critical/i })).toHaveAttribute("aria-label", "Critical: Critical evidence");
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/riskSignalChips.test.tsx`; expected FAIL: missing component.
- [ ] **Step 3: Implement**:

```tsx
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { RiskSignal } from "@/lib/orderRisk";
const order = { critical: 0, high: 1, medium: 2, low: 3, trust: 4 };
const dot = { critical: "bg-red-600", high: "bg-red-600", medium: "bg-amber-500", low: "bg-zinc-400", trust: "bg-green-600" };
export function RiskSignalChips({ signals, limit }: { signals: RiskSignal[]; limit?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...signals].sort((a, b) => order[a.severity] - order[b.severity]);
  return <div className="flex flex-wrap gap-1.5" aria-label="Risk signals">
    {(limit === undefined ? sorted : sorted.slice(0, limit)).map((signal) => <Popover key={signal.code} open={open === signal.code} onOpenChange={(value) => setOpen(value ? signal.code : null)}>
      <PopoverTrigger asChild><button type="button" aria-label={`${signal.label}: ${signal.evidence}`} className="inline-flex items-center gap-1.5 rounded-md bg-black/[0.05] px-2 py-1 text-xs text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/50">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot[signal.severity]}`} />{signal.label}
      </button></PopoverTrigger>
      <PopoverContent className="max-w-64 text-xs">{signal.evidence}</PopoverContent>
    </Popover>)}
  </div>;
}
```

- [ ] **Step 4: Run** `npx vitest run src/test/riskSignalChips.test.tsx`; expected PASS.
- [ ] **Step 5: Commit** `git add src/components/risk/RiskSignalChips.tsx src/test/riskSignalChips.test.tsx && git commit -m "feat: explain risk signals in severity chips"`.

### Task 5: Build reusable risk details and investigation actions

**Files:** Create `src/components/risk/RiskDetailsContent.tsx`, `src/components/risk/RiskDetailsDrawer.tsx`; test `src/test/riskDetailsDrawer.test.tsx`.

**Interfaces:** Consumes `AttemptDetailResponse`, `useRiskAttempt`, `useCreateRiskListEntries`, existing `updateProtectionReview(id,"approve"|"reject")`. Produces `<RiskDetailsContent detail={detail} />`, `<RiskDetailsDrawer attemptId={id|null} onClose={() => ...} />`. The shared content is also used by Task 7. Never expose hashes or render a Mark genuine action (Plan F).

- [ ] **Step 1: Write the failing test** (mock API at the client boundary):

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
const { apiFetch, updateProtectionReview } = vi.hoisted(() => ({ apiFetch: vi.fn(), updateProtectionReview: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/lib/orderProtection", () => ({ updateProtectionReview }));
import { RiskDetailsDrawer } from "@/components/risk/RiskDetailsDrawer";
const response = (value: unknown) => ({ ok: true, json: async () => value });
it("shows evidence, related activity and confirms selected server-side blocks", async () => {
  const user = userEvent.setup();
  const attempt = { id: "a", created_at: "2026-09-23T10:00:00Z", mode: "active", decision: "HOLD", score: 40,
    route: "public_v1", customer_name: "Mina", phone: "01712345448", total: 800, address: "Rajshahi", parsed_district: "Rajshahi",
    signals: [{ code: "device_many_phones", severity: "high", family: "DEVICE", points: 40, label: "One device, many phones", evidence: "This device used 4 phones" }],
    items: [{ productName: "Mango", quantity: 2, unitPrice: 400 }], deviceShortId: "abcdef12", fingerprintShortId: null,
    networkShortId: "12345678", network_type: "broadband", ip_prefix: "103.12.44.0/24", geo_city: "Rajshahi", geo_region: "E", geo_country: "BD", user_agent_summary: "Chrome · Android" };
  apiFetch.mockImplementation(async (url: string, init?: RequestInit) => url.endsWith("/attempts/a")
    ? response({ attempt, related: [{ ...attempt, id: "b", phone: "01700000000", topSignals: [] }], review: { id: "r", status: "on_hold" }, order: null })
    : init?.method === "POST" ? response({ entries: [] }) : response({}));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RiskDetailsDrawer attemptId="a" onClose={() => {}} /></QueryClientProvider>);
  expect(await screen.findByText("One device, many phones")).toBeInTheDocument();
  expect(screen.getByText("01700000000")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Block identities" }));
  await user.click(screen.getByRole("checkbox", { name: "Device" }));
  await user.click(screen.getByRole("button", { name: "Confirm block" }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/order-protection/lists", expect.objectContaining({ method: "POST", body: JSON.stringify({ attemptId: "a", list: "block", kinds: ["device"], reason: "Staff confirmed risk" }) })));
  expect(screen.queryByText("Mark genuine")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/riskDetailsDrawer.test.tsx`; expected FAIL: missing component.
- [ ] **Step 3: Implement** content and drawer. Reuse `normalizeProtectionItem`/`formatProtectionTotal` from `src/lib/orderProtectionDisplay.ts`; show placeholders for missing/scrubbed fields. The cart's product name, quantity and unit price come from `attempt.items`; do not invent values. `related` is the linked activity/risk logs view, with phone, decision and time. Use `aria-label` on every section.

```tsx
// src/components/risk/RiskDetailsContent.tsx
import { formatProtectionTotal, normalizeProtectionItem, protectionSourceLabel } from "@/lib/orderProtectionDisplay";
import { RiskSignalChips } from "@/components/risk/RiskSignalChips";
import type { AttemptDetailResponse } from "@/lib/orderRisk";

export function RiskDetailsContent({ detail }: { detail: AttemptDetailResponse }) {
  const { attempt, related, order } = detail;
  const cells = [
    ["Site", protectionSourceLabel(attempt.route)], ["Phone", attempt.phone || "—"],
    ["Total", formatProtectionTotal(attempt.total)], ["Decision", attempt.decision],
    ["Score", String(attempt.score)], ["Order status", order?.status || "No order"],
    ["Delivery address", attempt.address || "—"], ["District", attempt.parsed_district || "—"],
  ];
  return <div className="space-y-6 bg-[#FAFAF8] text-black">
    <div className="grid grid-cols-2 gap-px bg-black/10 sm:grid-cols-3">{cells.map(([label, value]) => <div key={label} className="min-h-16 bg-[#FAFAF8] p-3"><p className="text-[8px] font-medium uppercase tracking-[0.3em]">{label}</p><p className="mt-2 break-words text-sm font-light">{value}</p></div>)}</div>
    {attempt.mode === "shadow" && <p className="text-xs text-amber-700">Shadow decision — checkout was not blocked</p>}
    <section aria-label="Why this decision"><h3 className="text-sm font-medium">Why this decision</h3><p className="text-[8px] font-medium uppercase tracking-[0.3em]">What triggered this decision</p><div className="mt-2"><RiskSignalChips signals={attempt.signals} /></div></section>
    <section aria-label="Device and network"><h3 className="text-sm font-medium">Device &amp; network</h3><p className="mt-2 text-xs">Device {attempt.deviceShortId || "—"} · Browser {attempt.fingerprintShortId || "—"} · {attempt.user_agent_summary || "Unknown browser"}</p><p className="text-xs">{attempt.network_type || "Unknown network"} · {attempt.geo_city || "—"}, {attempt.geo_region || "—"}, {attempt.geo_country || "—"} · {attempt.ip_prefix || "—"}</p></section>
    <section aria-label="Linked activity"><h3 className="text-sm font-medium">Linked activity</h3>{related.length ? related.map((item) => <p key={item.id} className="py-1 text-xs">{item.phone || "Phone scrubbed"} · {item.decision} · {new Date(item.created_at).toLocaleString("en-BD")}</p>) : <p className="text-xs">No linked attempts</p>}</section>
    <section aria-label="Cart items"><h3 className="text-sm font-medium">Cart items</h3><table className="mt-2 w-full text-left text-xs"><thead><tr><th>Product</th><th>Qty</th><th>Price</th></tr></thead><tbody>{attempt.items.map((raw, index) => { const item = normalizeProtectionItem(raw); return <tr key={index}><td>{item.productName}{item.variantName ? ` · ${item.variantName}` : ""}</td><td>{item.quantity}</td><td>{formatProtectionTotal(item.unitPrice)}</td></tr>; })}</tbody></table></section>
    <section aria-label="Risk logs"><h3 className="text-sm font-medium">Risk logs</h3><table className="mt-2 w-full text-left text-xs"><thead><tr><th>Decision</th><th>Created</th></tr></thead><tbody>{[attempt, ...related].map((item) => <tr key={item.id}><td>{item.decision}</td><td>{new Date(item.created_at).toLocaleString("en-BD")}</td></tr>)}</tbody></table></section>
  </div>;
}
```

```tsx
// src/components/risk/RiskDetailsDrawer.tsx
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { updateProtectionReview } from "@/lib/orderProtection";
import { useCreateRiskListEntries, useRiskAttempt, type RiskKind } from "@/lib/orderRisk";
import { RiskDetailsContent } from "@/components/risk/RiskDetailsContent";

export function RiskDetailsDrawer({ attemptId, onClose }: { attemptId: string | null; onClose: () => void }) {
  const query = useRiskAttempt(attemptId);
  const create = useCreateRiskListEntries();
  const [confirm, setConfirm] = useState(false);
  const [selected, setSelected] = useState<RiskKind[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const detail = query.data;
  async function review(action: "approve" | "reject") {
    if (!detail?.review || busy) return;
    setBusy(true); setError("");
    try { await updateProtectionReview(detail.review.id, action); await query.refetch(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Review action failed"); }
    finally { setBusy(false); }
  }
  async function block() {
    if (!attemptId || !selected.length) return;
    try { await create.mutateAsync({ attemptId, list: "block", kinds: selected, reason: "Staff confirmed risk" }); setConfirm(false); setSelected([]); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not block identities"); }
  }
  return <Sheet open={Boolean(attemptId)} onOpenChange={(open) => { if (!open) onClose(); }}><SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-[#FAFAF8] sm:max-w-2xl">
    <SheetHeader><SheetTitle>Details / {detail?.order?.order_number ? `Order #${detail.order.order_number}` : `Attempt ${attemptId || ""}`}</SheetTitle></SheetHeader>
    {query.isPending && <p role="status">Loading risk details…</p>}{query.isError && <p role="alert">Could not load risk details.</p>}
    {detail && <><RiskDetailsContent detail={detail} /><div className="mt-6 flex flex-wrap gap-2">
      {detail.review?.status === "on_hold" && <><button type="button" disabled={busy} onClick={() => void review("approve")}>Approve &amp; create order</button><button type="button" disabled={busy} onClick={() => void review("reject")}>Reject</button></>}
      <button type="button" onClick={() => setConfirm(true)}>Block identities</button>
    </div></>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Block identities from this attempt?</AlertDialogTitle></AlertDialogHeader>
      <div className="space-y-2">{(["phone", "device", "network"] as RiskKind[]).map((kind) => <label key={kind} className="flex items-center gap-2 capitalize"><input type="checkbox" checked={selected.includes(kind)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, kind] : current.filter((value) => value !== kind))} />{kind}</label>)}</div>
      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={!selected.length || create.isPending} onClick={(event) => { event.preventDefault(); void block(); }}>Confirm block</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </SheetContent></Sheet>;
}
```

- [ ] **Step 4: Run** `npx vitest run src/test/riskDetailsDrawer.test.tsx`; expected PASS. Also verify dialog keyboard focus and post-action review state in the browser during Task 9.
- [ ] **Step 5: Commit** `git add src/components/risk/RiskDetailsContent.tsx src/components/risk/RiskDetailsDrawer.tsx src/test/riskDetailsDrawer.test.tsx && git commit -m "feat: add order risk investigation drawer"`.

### Task 6: Tabbed Order Protection attempts and lists

**Files:** Create `src/components/risk/RiskAttemptsTable.tsx`, `src/components/risk/RiskListsPanel.tsx`, `src/lib/orderRiskTabs.ts`; modify `src/pages/OrderProtection.tsx`, `src/components/OrderProtectionReviewQueue.tsx`, `src/lib/orderProtection.ts`; test `src/test/orderRiskDashboardPage.test.tsx`, update `src/test/orderProtectionPage.test.tsx` where needed.

**Interfaces:** Consumes Task 3 hooks, Task 4 chips, Task 5 drawer. Produces `ORDER_RISK_TABS` array in `src/lib/orderRiskTabs.ts` with the extension point `[..., { value: "accuracy", label: "Accuracy" }]` for Plan F. `ProtectionReview` gains optional `attempt_id?: string | null`; queue prop `onOpenAttempt?: (id: string) => void`.

- [ ] **Step 1: Write the failing test**:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
const { apiFetch, fetchProtectionReviews } = vi.hoisted(() => ({ apiFetch: vi.fn(), fetchProtectionReviews: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/lib/orderProtection", () => ({ fetchProtectionReviews, updateProtectionReview: vi.fn() }));
import OrderProtection from "@/pages/OrderProtection";
it("defaults to held and opens blocked attempt details", async () => {
  fetchProtectionReviews.mockResolvedValue({ reviews: [] });
  apiFetch.mockImplementation(async (url: string) => ({ ok: true, json: async () => url.includes("/attempts?")
    ? { attempts: [{ id: "a", created_at: "2026-09-23T10:00:00Z", decision: "BLOCK", score: 100, mode: "active", customer_name: "Mina", phone: "01712345448", parsed_district: "Rajshahi", total: 800, topSignals: [], order_id: null, review_id: null, label: null }] }
    : { attempt: { id: "a", decision: "BLOCK", signals: [], items: [] }, related: [], review: null, order: null } }));
  const user = userEvent.setup();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><OrderProtection /></QueryClientProvider>);
  expect(screen.getByRole("tab", { name: "Held" })).toHaveAttribute("data-state", "active");
  await user.click(screen.getByRole("tab", { name: "Blocked" }));
  expect(await screen.findByText("Mina")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /open risk details for mina/i }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/orderRiskDashboardPage.test.tsx`; expected FAIL: tabs missing.
- [ ] **Step 3: Implement** the tab config, table, list and page wiring:

```ts
// src/lib/orderRiskTabs.ts — Plan F appends { value: "accuracy", label: "Accuracy" } here and its TabsContent in the page.
export const ORDER_RISK_TABS = [
  { value: "held", label: "Held" }, { value: "blocked", label: "Blocked" },
  { value: "all", label: "All attempts" }, { value: "lists", label: "Lists" },
] as const;
```

```tsx
// src/components/risk/RiskAttemptsTable.tsx
import { useState } from "react";
import { useRiskAttempts, type AttemptSummary } from "@/lib/orderRisk";
import { RiskSignalChips } from "@/components/risk/RiskSignalChips";
import { formatProtectionTotal } from "@/lib/orderProtectionDisplay";
export function RiskAttemptsTable({ decision, onOpenAttempt }: { decision: "block" | "all"; onOpenAttempt: (id: string) => void }) {
  const [before, setBefore] = useState<string | null>(null);
  const [pages, setPages] = useState<AttemptSummary[]>([]);
  const query = useRiskAttempts(decision, before, 50);
  const rows = [...pages, ...(query.data?.attempts || [])];
  return <div className="overflow-x-auto">{query.isPending && <p role="status">Loading attempts…</p>}{query.isError && <p role="alert">Could not load attempts.</p>}
    <table className="w-full text-left text-xs"><thead><tr>{["Time", "Customer", "Phone", "District", "Total", "Decision", "Score", "Signals"].map((label) => <th key={label} className="px-2 py-3 text-[8px] uppercase tracking-[0.3em]">{label}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-black/10"><td className="px-2 py-3">{new Date(row.created_at).toLocaleString("en-BD")}</td><td><button type="button" aria-label={`Open risk details for ${row.customer_name || "customer"}`} onClick={() => onOpenAttempt(row.id)} className="rounded-md text-left underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-black/50">{row.customer_name || "—"}</button></td><td>{row.phone ? `${row.phone.slice(0, 3)}•••••${row.phone.slice(-3)}` : "—"}</td><td>{row.parsed_district || "—"}</td><td>{formatProtectionTotal(row.total)}</td><td className={row.decision === "BLOCK" ? "text-red-700" : row.decision === "HOLD" ? "text-amber-700" : "text-green-700"}>{row.decision}</td><td>{row.score}</td><td><RiskSignalChips signals={row.topSignals} limit={2} /></td></tr>)}</tbody>
    </table>{!query.isPending && !rows.length && <p className="p-6 text-sm">No risk attempts found.</p>}
    {(query.data?.attempts.length || 0) === 50 && <button type="button" disabled={query.isFetching} onClick={() => { setPages(rows); setBefore(query.data!.attempts[query.data!.attempts.length - 1].created_at); }}>Load more</button>}
  </div>;
}
```

```tsx
// src/components/risk/RiskListsPanel.tsx
import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useDeleteRiskListEntry, useRiskList, type RiskListEntry } from "@/lib/orderRisk";
export function RiskListsPanel() {
  const [list, setList] = useState<"block" | "allow">("block");
  const [target, setTarget] = useState<RiskListEntry | null>(null);
  const query = useRiskList(list); const remove = useDeleteRiskListEntry();
  return <section aria-label="Risk lists"><div className="flex gap-2"><button type="button" aria-pressed={list === "block"} onClick={() => setList("block")}>Block list</button><button type="button" aria-pressed={list === "allow"} onClick={() => setList("allow")}>Allow list</button></div>
    {query.isPending && <p role="status">Loading list…</p>}{query.isError && <p role="alert">Could not load list.</p>}
    {(query.data?.entries || []).map((entry) => <div key={entry.id} className="flex items-center justify-between border-b border-black/10 py-3 text-xs"><span>{entry.kind} · {entry.display_hint || "Hidden"} · {entry.reason || "No reason"}</span><button type="button" onClick={() => setTarget(entry)}>Remove</button></div>)}
    {!query.isPending && !query.data?.entries.length && <p className="py-4 text-xs">No entries.</p>}
    <AlertDialog open={Boolean(target)} onOpenChange={(open) => { if (!open) setTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this list entry?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={remove.isPending} onClick={(event) => { event.preventDefault(); if (target) void remove.mutateAsync(target.id).then(() => setTarget(null)); }}>Remove entry</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
```

```tsx
// src/pages/OrderProtection.tsx — retain existing header/motion styling and replace the single queue panel.
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ORDER_RISK_TABS } from "@/lib/orderRiskTabs";
import { RiskAttemptsTable } from "@/components/risk/RiskAttemptsTable";
import { RiskListsPanel } from "@/components/risk/RiskListsPanel";
import { RiskDetailsDrawer } from "@/components/risk/RiskDetailsDrawer";
import { OrderProtectionReviewQueue } from "@/components/OrderProtectionReviewQueue";
export default function OrderProtection() {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  return <main className="min-h-full space-y-6 bg-[#FAFAF8] p-2"><h1 className="text-2xl font-light">Order Protection</h1>
    <Tabs defaultValue="held"><TabsList aria-label="Order protection views">{ORDER_RISK_TABS.map((tab) => <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>)}</TabsList>
      <TabsContent value="held"><OrderProtectionReviewQueue onOpenAttempt={setAttemptId} /></TabsContent>
      <TabsContent value="blocked"><RiskAttemptsTable decision="block" onOpenAttempt={setAttemptId} /></TabsContent>
      <TabsContent value="all"><RiskAttemptsTable decision="all" onOpenAttempt={setAttemptId} /></TabsContent>
      <TabsContent value="lists"><RiskListsPanel /></TabsContent>
    </Tabs>{attemptId && <RiskDetailsDrawer attemptId={attemptId} onClose={() => setAttemptId(null)} />}
  </main>;
}
```

In `src/lib/orderProtection.ts`, extend the `ProtectionReview` type with `attempt_id?: string | null`. In `OrderProtectionReviewQueue.tsx`, change `export function OrderProtectionReviewQueue()` to `export function OrderProtectionReviewQueue({ onOpenAttempt }: { onOpenAttempt?: (id: string) => void })`, and beside the existing Call/Copy actions insert:

```tsx
{review.attempt_id && onOpenAttempt && <button type="button" onClick={() => onOpenAttempt(review.attempt_id!)} className={cn(actionChip, actionChipNeutral)}>Open details</button>}
```

- [ ] **Step 4: Run** `npx vitest run src/test/orderRiskDashboardPage.test.tsx src/test/orderProtectionPage.test.tsx`; expected PASS. Keep the prior queue tests' review-row behavior intact. The drawer is mounted only when open, so the old held-only page test needs no query provider; wrap the new interactive page test in a QueryClientProvider.
- [ ] **Step 5: Commit** `git add src/components/risk/RiskAttemptsTable.tsx src/components/risk/RiskListsPanel.tsx src/lib/orderRiskTabs.ts src/pages/OrderProtection.tsx src/components/OrderProtectionReviewQueue.tsx src/lib/orderProtection.ts src/test/orderRiskDashboardPage.test.tsx src/test/orderProtectionPage.test.tsx && git commit -m "feat: add order protection risk tabs and lists"`.

### Task 7: Show the same risk details in website orders

**Files:** Modify `src/hooks/useOrderEditorTab.ts`, `src/components/order-editor/OrderEditorTabs.tsx`, `src/pages/OrderDetail.tsx`; create `src/components/risk/OrderRiskPanel.tsx`; test `src/test/orderRiskOrderDetail.test.tsx` and existing `src/test/order-detail.test.ts`.

**Interfaces:** Consumes `useOrderRisk(orderId)`, `useRiskAttempt`, `useCreateRiskListEntries` and `RiskDetailsContent`; produces `OrderRiskPanel({orderId})`. Existing Details/Logs URL behavior stays intact; `?tab=risk` opens Risk. Only website/storefront normalized source exposes the tab; legacy/other orders retain Details/Logs. A confirmation allows staff to block an identity from this editor.

- [ ] **Step 1: Write the failing test** in `src/test/orderRiskOrderDetail.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));
import OrderDetail from "@/pages/OrderDetail";
it("offers Risk beside Logs on website orders and explains empty assessments", async () => {
  apiFetch.mockImplementation(async (url: string) => ({ ok: true, json: async () => url === "/api/orders/o/risk" ? { attempt: null }
    : url === "/api/orders/o" ? { order: { id: "o", source: "website", order_number: "123", status: "confirmed" }, items: [], canEditItems: true }
    : url === "/api/products" ? { products: [] } : url === "/api/orders" ? { orders: [] } : { events: [] } }));
  const user = userEvent.setup();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/orders/o"]}><Routes><Route path="/orders/:id" element={<OrderDetail />} /></Routes></MemoryRouter></QueryClientProvider>);
  await user.click(await screen.findByRole("radio", { name: "Risk" }));
  expect(await screen.findByText("No risk assessment for this order")).toBeInTheDocument();
  expect(apiFetch).toHaveBeenCalledWith("/api/orders/o/risk", undefined);
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/orderRiskOrderDetail.test.tsx`; expected FAIL: Risk tab missing.
- [ ] **Step 3: Implement**:

```tsx
// src/components/risk/OrderRiskPanel.tsx
import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useRiskAttempt, useOrderRisk } from "@/lib/orderRisk";
import { useCreateRiskListEntries, type RiskKind } from "@/lib/orderRisk";
import { RiskDetailsContent } from "@/components/risk/RiskDetailsContent";
export function OrderRiskPanel({ orderId }: { orderId: string }) {
  const orderRisk = useOrderRisk(orderId);
  const detail = useRiskAttempt(orderRisk.data?.attempt?.id || null);
  const create = useCreateRiskListEntries();
  const [confirm, setConfirm] = useState(false);
  const [selected, setSelected] = useState<RiskKind[]>([]);
  if (orderRisk.isPending || detail.isPending && orderRisk.data?.attempt) return <p role="status">Loading risk assessment…</p>;
  if (orderRisk.isError || detail.isError) return <p role="alert">Could not load risk assessment.</p>;
  if (!orderRisk.data?.attempt) return <p>No risk assessment for this order</p>;
  if (!detail.data) return <p role="status">Loading risk assessment…</p>;
  return <><RiskDetailsContent detail={detail.data} /><button type="button" onClick={() => setConfirm(true)}>Block identities</button>
    <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Block identities from this order?</AlertDialogTitle></AlertDialogHeader>
      <div className="space-y-2">{(["phone", "device", "network"] as RiskKind[]).map((kind) => <label key={kind} className="flex items-center gap-2 capitalize"><input type="checkbox" checked={selected.includes(kind)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, kind] : current.filter((value) => value !== kind))} />{kind}</label>)}</div>
      {create.isError && <p role="alert">Could not block identities.</p>}
      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={!selected.length || create.isPending} onClick={(event) => { event.preventDefault(); void create.mutateAsync({ attemptId: orderRisk.data!.attempt!.id, list: "block", kinds: selected, reason: "Staff confirmed risk" }).then(() => { setConfirm(false); setSelected([]); }); }}>Confirm block</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </>;
}
```

Update `useOrderEditorTab.ts`'s union and parser:

```ts
export type OrderEditorTab = "details" | "logs" | "risk";
const selected = searchParams.get(TAB_PARAM);
const tab: OrderEditorTab = selected === "logs" || selected === "risk" ? selected : "details";
const setTab = useCallback((next: OrderEditorTab) => {
  setSearchParams((current) => {
    const params = new URLSearchParams(current);
    if (next === "details") params.delete(TAB_PARAM);
    else params.set(TAB_PARAM, next);
    return params;
  }, { replace: true, state: location.state });
}, [setSearchParams, location.state]);
```

In `OrderEditorTabs.tsx`, accept `showRisk = false` on `OrderEditorTabSwitch`, map `"risk"` in `onSelectionChange`, and insert the third item; use these replacement fragments for the existing typed props and selection handler:

```tsx
export function OrderEditorTabSwitch({ value, onChange, className, showRisk = false }: {
  value: OrderEditorTab; onChange: (tab: OrderEditorTab) => void; className?: string; showRisk?: boolean;
}) {
  const itemClass = ({ isSelected }: { isSelected: boolean }) => cn(
    "px-3 py-1.5 font-sans text-[13px]",
    isSelected ? "font-medium text-black" : "font-normal text-black/55 hover:text-black/80",
  );
  return <SegmentedControl data-testid="order-editor-tab-switch" aria-label="Order editor view"
    selectedKeys={new Set([value])}
    onSelectionChange={(keys) => { const selected = String([...keys][0] || "details"); onChange(selected === "logs" || selected === "risk" ? selected : "details"); }}
    thumbClassName="rounded-md border border-black/[0.08] bg-white shadow-sm"
    className={cn("shrink-0 rounded-lg bg-black/[0.055] p-1 ring-1 ring-black/[0.035]", className)}>
    <SegmentedControlItem id="details" className={itemClass}>Order details</SegmentedControlItem>
    <SegmentedControlItem id="logs" className={itemClass}>Logs</SegmentedControlItem>
    {showRisk && <SegmentedControlItem id="risk" className={itemClass}>Risk</SegmentedControlItem>}
  </SegmentedControl>;
}
```

Add `risk?: ReactNode` to `OrderEditorTabPanels` props and destructuring; change its `showLogs` boolean used by the Details panel to `showOther = tab !== "details"` (including `aria-hidden`, exit completion and absolute positioning), render Logs only on `tab === "logs"`, and use this complete Risk branch beside it. Details remains mounted so draft edits survive switching tabs. In `OrderDetail.tsx`, import `OrderRiskPanel`, pass `showRisk={normalizeOrderSource(order.source) === "website"}` to the switch, `risk={<OrderRiskPanel orderId={order.id} />}` to panels, and use `tab={editorTab === "risk" && normalizeOrderSource(order.source) !== "website" ? "details" : editorTab}` on both switch and panels.

```tsx
{tab === "risk" && risk && <motion.div data-testid="order-editor-risk-panel" initial={reduceMotion ? false : { x: "6%", opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={transition}>{risk}</motion.div>}
```

- [ ] **Step 4: Run** `npx vitest run src/test/orderRiskOrderDetail.test.tsx src/test/order-detail.test.ts src/test/orderDetailPendingNavigation.test.tsx`; expected PASS, including preserved `?fulfillmentTab=` when switching tabs.
- [ ] **Step 5: Commit** `git add src/hooks/useOrderEditorTab.ts src/components/order-editor/OrderEditorTabs.tsx src/pages/OrderDetail.tsx src/components/risk/OrderRiskPanel.tsx src/test/orderRiskOrderDetail.test.tsx && git commit -m "feat: show risk assessment in website order editor"`.

### Task 8: Admin protection settings in Workspace

**Files:** Create `src/components/settings/OrderProtectionSettings.tsx`; modify `src/pages/Settings.tsx`; test `src/test/orderProtectionSettings.test.tsx`.

**Interfaces:** Consumes `useRiskSettings`, `useSaveRiskSettings`, `useUserRole`; saves `{mode,haterDistrictIds,extraAbuseTerms}`. `districtOptions` are read from the API, grouped by `divisionName`; no client-supplied org id.

- [ ] **Step 1: Write the failing test**:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));
import { OrderProtectionSettings } from "@/components/settings/OrderProtectionSettings";
it("saves mode, district ids and normalized abuse terms", async () => {
  apiFetch.mockImplementation(async (_url: string, init?: RequestInit) => ({ ok: true, json: async () => init?.method === "PUT" ? JSON.parse(String(init.body)) : {
    mode: "shadow", haterDistrictIds: ["15"], extraAbuseTerms: [], districtOptions: [{ id: "15", name: "Rajshahi", bnName: "রাজশাহী", divisionName: "Rajshahi" }, { id: "16", name: "Natore", bnName: "নাটোর", divisionName: "Rajshahi" }],
  } }));
  const user = userEvent.setup();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><OrderProtectionSettings /></QueryClientProvider>);
  await user.selectOptions(await screen.findByLabelText("Protection mode"), "active");
  await user.click(screen.getByRole("checkbox", { name: /natore/i }));
  await user.type(screen.getByLabelText("Extra abuse terms"), "  scam  {enter}scam");
  await user.click(screen.getByRole("button", { name: "Save protection settings" }));
  expect(apiFetch).toHaveBeenCalledWith("/api/order-protection/settings", expect.objectContaining({ method: "PUT", body: JSON.stringify({ mode: "active", haterDistrictIds: ["15", "16"], extraAbuseTerms: ["scam"] }) }));
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/orderProtectionSettings.test.tsx`; expected FAIL: missing component.
- [ ] **Step 3: Implement**:

```tsx
// src/components/settings/OrderProtectionSettings.tsx
import { useEffect, useState } from "react";
import { useRiskSettings, useSaveRiskSettings, type RiskSettings } from "@/lib/orderRisk";
export function OrderProtectionSettings() {
  const query = useRiskSettings(); const save = useSaveRiskSettings();
  const [mode, setMode] = useState<RiskSettings["mode"]>("shadow");
  const [districts, setDistricts] = useState<string[]>([]);
  const [terms, setTerms] = useState("");
  useEffect(() => { if (query.data) { setMode(query.data.mode); setDistricts(query.data.haterDistrictIds); setTerms(query.data.extraAbuseTerms.join("\n")); } }, [query.data]);
  const groups = (query.data?.districtOptions || []).reduce<Record<string, RiskSettings["districtOptions"]>>((all, option) => {
    (all[option.divisionName] ||= []).push(option);
    return all;
  }, {});
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const extraAbuseTerms = [...new Set(terms.split(/\r?\n/).map((term) => term.trim()).filter(Boolean))];
    await save.mutateAsync({ mode, haterDistrictIds: districts, extraAbuseTerms });
  }
  if (query.isPending) return <p role="status">Loading protection settings…</p>;
  if (query.isError) return <p role="alert">Could not load protection settings.</p>;
  return <form onSubmit={(event) => void submit(event)} className="space-y-4 bg-[#FAFAF8] p-3 text-sm">
    <label htmlFor="protection-mode">Protection mode</label><select id="protection-mode" value={mode} onChange={(event) => setMode(event.target.value as RiskSettings["mode"])}>
      <option value="off">Off — no risk assessment</option><option value="shadow">Shadow — log without enforcement</option><option value="active">Active — enforce holds and blocks</option>
    </select>
    <fieldset><legend>Hater districts</legend>{Object.entries(groups).map(([division, options]) => <div key={division}><p className="text-[8px] font-medium uppercase tracking-[0.3em]">{division}</p>{options?.map((option) => <label key={option.id} className="mr-3 inline-flex items-center gap-1"><input type="checkbox" checked={districts.includes(option.id)} onChange={(event) => setDistricts((current) => event.target.checked ? [...current, option.id] : current.filter((id) => id !== option.id))} />{option.name} · {option.bnName}</label>)}</div>)}</fieldset>
    <label htmlFor="abuse-terms">Extra abuse terms</label><textarea id="abuse-terms" value={terms} onChange={(event) => setTerms(event.target.value)} placeholder="One term per line" />
    <p className="text-xs">One term per line, up to 200 terms and 40 characters each.</p>
    {save.isError && <p role="alert">Could not save protection settings.</p>}
    <button type="submit" disabled={save.isPending}>Save protection settings</button>
  </form>;
}
```

In `src/pages/Settings.tsx`, import `OrderProtectionSettings` and `ShieldCheck` from Phosphor, change `WorkspaceSection()` to accept `{ isAdmin }: { isAdmin: boolean }`, add `{isAdmin && <GroupSection icon={ShieldCheck} title="Order protection" description="Control risk assessment and dictionaries."><OrderProtectionSettings /></GroupSection>}` immediately after `StorefrontDomainSection`, and pass `<WorkspaceSection isAdmin={isAdmin} />` in the `workspace` branch. `GroupSection` accepts `React.ElementType`; use Phosphor `ShieldCheck` with `weight="light"` in a local heading if the wrapper renders only Lucide-specific `strokeWidth`.

- [ ] **Step 4: Run** `npx vitest run src/test/orderProtectionSettings.test.tsx`; expected PASS. Check non-admin workspace does not render protection controls.
- [ ] **Step 5: Commit** `git add src/components/settings/OrderProtectionSettings.tsx src/pages/Settings.tsx src/test/orderProtectionSettings.test.tsx && git commit -m "feat: add admin order protection settings"`.

### Task 9: Full checks and safe manual QA

**Files:** No additional implementation files; inspect the committed diff against this plan and §11.

**Interfaces:** Verifies all Task 1–8 outputs together. Plan F appends Accuracy to `ORDER_RISK_TABS` and adds a matching `TabsContent`; it owns `POST /attempts/:id/label`, `GET /accuracy`, and Mark genuine.

- [ ] **Step 1: Write a failing integration check** before final polish in `src/test/orderRiskIntegration.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
it("retains all dashboard extension points without exposing a commerce-table client", () => {
  const tabs = readFileSync(resolve("src/lib/orderRiskTabs.ts"), "utf8");
  const client = readFileSync(resolve("src/lib/orderRisk.ts"), "utf8");
  expect(tabs).toContain('value: "held"');
  expect(tabs).toContain('value: "lists"');
  expect(client).toContain('import { apiFetch } from "@/lib/api"');
  expect(client).not.toContain('from("order_risk_attempts")');
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/orderRiskIntegration.test.ts` before finishing the preceding tasks; expected FAIL until the tab/client modules exist. If executing sequentially after Task 8, verify that removing an extension point makes the test fail, then restore it.
- [ ] **Step 3: Complete the minimal integration implementation** by retaining the exact tab and client declarations from Tasks 3 and 6; the checked source is:

```ts
// src/lib/orderRiskTabs.ts
export const ORDER_RISK_TABS = [
  { value: "held", label: "Held" }, { value: "blocked", label: "Blocked" },
  { value: "all", label: "All attempts" }, { value: "lists", label: "Lists" },
] as const;
// src/lib/orderRisk.ts starts with import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// and import { apiFetch } from "@/lib/api"; there is no direct Supabase table access.
```

- [ ] **Step 4: Run** `npx vitest run src/test/orderRiskIntegration.test.ts`, then `npm test`, `npm run lint`, `npm run build`; expected PASS. Inspect rendered `/order-protection` with browse/qa skill using fixtures only: Held default; Blocked/All load-more; list toggle and removal confirmation; Sheet focus/close, evidence on click/keyboard, linked phones, missing/scrubbed fields, cart and logs; approve/reject only for on-hold review; block action confirmation; website order Risk empty/present; Details and Logs still preserve unsaved editor state; admin-only Settings; narrow viewport. Do not submit a real order or apply a production mutation.
- [ ] **Step 5: Commit** `git add src/test/orderRiskIntegration.test.ts && git commit -m "test: verify order risk dashboard boundaries"`.

## Contract notes and risks

1. §12 says settings GET/PUT return `{ mode, haterDistrictIds, extraAbuseTerms }`; the dashboard also needs `districtOptions`, so GET and PUT add that field without changing the required keys. `mode` should be the effective value after the environment kill switch; if showing a separately saved mode is required, extend the contract in Plan F.
2. §10 `order_risk_attempts` has only the latest persisted `network_type`/`ip_prefix` and hashed device identity. It does not have raw “networks seen in the last hour” or distinct device counts. `listRelatedAttempts` supports a safe recent-activity view; do not claim complete graph counts or return raw hashes. The API summary phone is from the explicit display column; mask in list presentation if desired, while the drawer can show the retained number for staff calls.
3. The existing review PATCH route is staff-authenticated but not admin-restricted. This plan reuses it for Approve/Reject and `/order-protection` is already an `AdminRoute`; the existing route's authorization policy must be reconciled with the shared admin-only mutation contract before rollout. Coordinate with its owner if another phase changes the route.
4. Verify Plan C’s `createListEntries` entry object field names and `deleteListEntry` return behavior against the merged implementation before route integration. The shared contract fixes function signatures but not their returned row shape. Ensure returned entries exclude `value_hash` and `org_id`.
5. `server/index.js` has unrelated staged changes in the current checkout. Do not stage or commit them with Task 2; review the index/worktree diff with their owner.
