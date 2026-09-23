# Order Risk Engine v2 — Feedback, Accuracy, Retention & Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn staff and courier outcomes into ground-truth labels, report shadow and active accuracy, retain safe history, and document a measured rollout.

**Architecture:** Pure label and accuracy helpers live in `server/risk/`; existing order, courier, review, and cron routes call the Plan C store through the fixed workspace. The Plan E dashboard extension points display feedback actions and metrics. All routes remain in `server/index.js`.

**Tech Stack:** Node 20 ESM, Express, Supabase, React 18, TanStack Query, shadcn/ui, Vitest.

## Global Constraints

- Single tenant: every query on user data filters by the resolved Mango Lover BD `org_id`; never accept an org id from a client.
- Every new authenticated route: `requireOrderProtectionStaff(req)` → `if (!user) return 401`; mutations additionally require `role === "admin"` (403 otherwise).
- New server routes go in `server/index.js` in the `// ─── Order Protection Review Queue` section; pure logic goes in `server/risk/*.js` (ESM, no default exports).
- Identifiers (phone, device ID, fingerprint, network key, IP, user agent) are stored only as `hashProtectionSignal(value, process.env.ORDER_PROTECTION_HASH_SECRET)` except the explicitly listed display columns in `order_risk_attempts`.
- Never log raw phone, address, IP, device ID, or user agent.
- Always `normalizeBdPhone()` before using a phone; valid BD mobile = `^01[3-9]\d{8}$`.
- No AI calls anywhere in the checkout path.
- Checkout never loses an order because of our infrastructure: dependency failure ⇒ HOLD, never BLOCK.
- Merchant Suite tests: `src/test/*.test.ts(x)`, run `npx vitest run <file>`; import server modules as `../../server/...js`. Full checks: `npm test`, `npm run lint`, `npm run build`.
- Migrations: new files in `supabase/migrations/`, wrapped in `begin; … commit;`, RLS enabled, `revoke all … from anon, authenticated; grant all … to service_role;`. Add new tables to `scripts/verify-supabase-baseline.mjs`. **Do not apply remote migrations, change production env vars, deploy, or submit a real order during implementation.**
- UI: Phosphor icons `weight="light"`, `৳` for money, follow the existing `src/pages/OrderProtection.tsx` / `OrderProtectionReviewQueue.tsx` visual style, shadcn components from `src/components/ui/`, `apiFetch()` only.
- Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:` imperative style, one commit per task minimum.
- Accuracy window is based on `created_at`, includes `shadow` attempts, and excludes unknown labels from precision denominators; ratios use 0–1 and are `null` where the denominator is zero.
- Historical production cancellations are not inferred as fake: 131 of 140 recent website cancellations had no recorded reason. Current staff cancellation already calls `validateCancellationReason()`; preserve this behavior.

---

## File map and dependencies

Execute after Plans C, D, E. The snippets assume Plan C exports `labelRiskAttempt`, `createListEntries`, `getRiskAttempt`, `scrubExpiredRiskAttempts`; Plan E exports `buildDisplayHint` from `server/risk/serialize.js` and its documented Accuracy-tab extension point. Check their actual argument shapes before applying snippets; shared §10 and §12 signatures below take precedence. Keep `server/index.js` changes surgically inside existing routes—do not overwrite parallel edits.

| File | Responsibility |
|---|---|
| `server/risk/labels.js` | Pure order label decision and best-effort linked-attempt update |
| `server/risk/accuracy.js` | Pure metrics over bounded attempt rows |
| `server/index.js` | Outcome hooks, admin label and accuracy routes, maintenance |
| `src/components/risk/RiskBlockSuggestionDialog.tsx` | Shared explicit block confirmation |
| `src/pages/OrderDetail.tsx`, `src/components/OrdersTable.tsx` | Open block confirmation after successful fake cancellation |
| `src/components/OrderProtectionReviewQueue.tsx`, `src/lib/orderProtection.ts` | Explicit reject-as-fake action |
| `src/components/risk/RiskDetailsContent.tsx`, `src/lib/orderRisk.ts` | Admin genuine action |
| `src/components/risk/RiskAccuracyPanel.tsx`, `src/pages/OrderProtection.tsx` | Accuracy tab |
| `docs/runbooks/order-protection.md`, `CHANGELOG.md` | Operator rollout and release notes |

### Task 1: Pure outcome labels

**Files:**
- Create: `server/risk/labels.js`
- Test: `src/test/orderRiskLabels.test.ts`

**Interfaces:**
- Consumes: `labelRiskAttempt(supabase, { orgId, attemptId, label })` from Plan C.
- Produces: `FAKE_CANCELLATION_CODES`, `labelForOrder(order): "fake"|"genuine"|null`, `labelOrderRiskAttempt(supabase, orgId, order): Promise<void>`.

- [ ] **Step 1: Write failing test.**

```ts
import { describe, expect, it, vi } from "vitest";
import { FAKE_CANCELLATION_CODES, labelForOrder, labelOrderRiskAttempt } from "../../server/risk/labels.js";
describe("outcome labels", () => {
  it("recognizes only recorded fake reasons or delivered courier statuses", () => {
    expect(FAKE_CANCELLATION_CODES).toEqual(["fraud_or_suspicious", "test_or_fake_order"]);
    expect(labelForOrder({ status: "cancelled", cancellation_reason_code: "fraud_or_suspicious" })).toBe("fake");
    expect(labelForOrder({ status: "cancelled", cancellation_reason_code: "test_or_fake_order" })).toBe("fake");
    expect(labelForOrder({ status: "cancelled", cancellation_reason_code: null })).toBeNull();
    expect(labelForOrder({ status: "cancelled", cancellation_reason_code: "customer_unreachable" })).toBeNull();
    expect(labelForOrder({ courier_status: "Delivered_Approval_Pending" })).toBe("genuine");
    expect(labelForOrder({ courier_status: "partial_delivered" })).toBeNull();
  });
  it("does not write without an attempt and contains store failures", async () => {
    const from = vi.fn(() => ({ update: () => { throw new Error("down"); } }));
    await expect(labelOrderRiskAttempt({ from }, "org-1", { risk_attempt_id: "attempt-1", courier_status: "delivered" })).resolves.toBeUndefined();
    await labelOrderRiskAttempt({ from }, "org-1", { courier_status: "delivered" });
    expect(from).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** Run: `npx vitest run src/test/orderRiskLabels.test.ts`. Expected: FAIL (missing `server/risk/labels.js`).
- [ ] **Step 3: Write minimal implementation.**

```js
// server/risk/labels.js
import { labelRiskAttempt } from "./store.js";
export const FAKE_CANCELLATION_CODES = Object.freeze(["fraud_or_suspicious", "test_or_fake_order"]);
export function labelForOrder(order) {
  if (String(order?.status || "").toLowerCase() === "cancelled" && FAKE_CANCELLATION_CODES.includes(order?.cancellation_reason_code)) return "fake";
  if (["delivered", "delivered_approval_pending"].includes(String(order?.courier_status || "").toLowerCase())) return "genuine";
  return null;
}
export async function labelOrderRiskAttempt(supabase, orgId, order) {
  const label = labelForOrder(order);
  if (!orgId || !order?.risk_attempt_id || !label) return;
  try {
    await labelRiskAttempt(supabase, { orgId, attemptId: order.risk_attempt_id, label });
  } catch {
    console.warn("[OrderRisk] Could not persist outcome label");
  }
}
```

- [ ] **Step 4: Run test to verify it passes.** Run: `npx vitest run src/test/orderRiskLabels.test.ts`. Expected: PASS with Plan C store present.
- [ ] **Step 5: Commit.** `git add server/risk/labels.js src/test/orderRiskLabels.test.ts && git commit -m "feat: classify protected order outcomes"`

### Task 2: Staff cancellations and courier delivery hooks

**Files:**
- Modify: `server/index.js:8290-8430, 8856-9103`
- Test: `src/test/orderRiskOutcomeWiring.test.ts`

**Interfaces:**
- Consumes: `labelOrderRiskAttempt(supabase, orgId, order)` and `FAKE_CANCELLATION_CODES` from Task 1.
- Produces: `PATCH /api/orders/:id` successful JSON may include `riskBlockSuggestion: { attemptId }` only on a staff fake cancellation with linked attempt.

- [ ] **Step 1: Write failing source-wiring test.**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync("server/index.js", "utf8");
const between = (a: string, b: string) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a) + a.length));
describe("risk outcome wiring", () => {
  it("labels only after committed staff cancellation and suggests an explicit block", () => {
    const route = between('app.patch("/api/orders/:id"', 'app.post("/api/orders/:id/send-sms"');
    expect(route).toContain("FAKE_CANCELLATION_CODES.includes(cancellationReason?.code)");
    expect(route).toContain("await labelOrderRiskAttempt(supabase, orgId, data)");
    expect(route).toContain("riskBlockSuggestion: { attemptId: data.risk_attempt_id }");
    expect(route.indexOf("await labelOrderRiskAttempt")).toBeGreaterThan(route.indexOf("if (!updatedRow)"));
  });
  it("covers staff courier edit, both status polls and authenticated Steadfast webhook", () => {
    for (const marker of ['app.patch("/api/orders/:id"', 'app.post("/api/pathao/refresh-status"', 'app.post("/api/steadfast/refresh-status"', 'app.post("/api/webhooks/steadfast"']) {
      const start = source.indexOf(marker);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(source.slice(start, start + (marker.includes("orders/:id") ? 7500 : 6000))).toContain("labelOrderRiskAttempt(");
    }
    expect(source.match(/\.select\("id, consignment_id, tracking_code, courier_status, status, courier_name, courier_message, risk_attempt_id"\)/g)).toHaveLength(2);
    expect(source).toContain('.select("id, org_id, courier_status, status, risk_attempt_id")');
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** Run: `npx vitest run src/test/orderRiskOutcomeWiring.test.ts`. Expected: FAIL on missing import/hook.
- [ ] **Step 3: Write minimal implementation.** Add `import { FAKE_CANCELLATION_CODES, labelOrderRiskAttempt } from "./risk/labels.js";` at the imports. In `PATCH /api/orders/:id`, after successful `data` read and activity write, before return, insert:

```js
    const suggestRiskBlock = isStaffCancellation && FAKE_CANCELLATION_CODES.includes(cancellationReason?.code) && Boolean(data.risk_attempt_id);
    if (suggestRiskBlock || ["delivered", "delivered_approval_pending"].includes(String(update.courier_status || "").toLowerCase())) {
      await labelOrderRiskAttempt(supabase, orgId, data);
    }
    return res.json({ success: true, order: data, ...(suggestRiskBlock ? { riskBlockSuggestion: { attemptId: data.risk_attempt_id } } : {}) });
```

Replace the old `return res.json({ success: true, order: data });` only in that route. In both refresh queries append `risk_attempt_id` to selected columns; after each **successful** org-scoped `orders.update(patch)` add:

```js
        if (["delivered", "delivered_approval_pending"].includes(String(patch.courier_status || "").toLowerCase())) {
          await labelOrderRiskAttempt(supabase, orgId, { ...order, ...patch });
        }
```

In the Steadfast webhook select `id, org_id, courier_status, status, risk_attempt_id` and after `updatedOrder` is confirmed (after webhook-secret verification) add:

```js
    if (["delivered", "delivered_approval_pending"].includes(String(patch.courier_status || "").toLowerCase())) {
      await labelOrderRiskAttempt(supabase, order.org_id, { ...order, ...patch });
    }
```

Keep all current org filters, existing courier responses, and webhook secret check. Neither `partial_delivered` nor `partial_delivered_approval_pending` counts as genuine. Never label on a failed write; for poll routes inspect `{ error }` from update and throw before the helper. The social-inbox PATCH writes `social_inbox_orders`, which has no `risk_attempt_id`; leave it unlabelled.
- [ ] **Step 4: Run test to verify it passes.** Run: `npx vitest run src/test/orderRiskOutcomeWiring.test.ts src/test/orderActivity.test.ts src/test/orderProtectionReviewRoutes.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add server/index.js src/test/orderRiskOutcomeWiring.test.ts && git commit -m "feat: label protected orders on cancellation and delivery"`

### Task 3: Held-review rejection feedback

**Files:**
- Modify: `server/index.js:12885-12924`
- Modify: `src/test/orderProtectionReviewRoutes.test.ts`

**Interfaces:**
- Consumes: `labelRiskAttempt(supabase, { orgId, attemptId, label })`.
- Produces: `PATCH /api/order-protection/reviews/:id` accepts `{ action: "reject", rejectReason?: "fake"|"other" }`; only `fake` labels a linked attempt.

- [ ] **Step 1: Add failing test to `orderProtectionReviewRoutes.test.ts`.**

```ts
it("rejects with an optional reason and labels only an existing fake attempt", () => {
  const route = source.slice(source.indexOf('app.patch("/api/order-protection/reviews/:id"'), source.indexOf("// ─── Public Storefront Order Submission"));
  expect(route).toContain('req.body?.rejectReason');
  expect(route).toContain('rejectReason !== "fake" && rejectReason !== "other"');
  expect(route).toContain('.select("id, status, attempt_id")');
  expect(route).toContain('rejectReason === "fake" && data.attempt_id');
  expect(route).toContain('labelRiskAttempt(supabase, { orgId, attemptId: data.attempt_id, label: "fake" })');
});
```

- [ ] **Step 2: Run test to verify it fails.** Run: `npx vitest run src/test/orderProtectionReviewRoutes.test.ts`. Expected: FAIL on `rejectReason`.
- [ ] **Step 3: Write minimal implementation.** Import `labelRiskAttempt` from `./risk/store.js` once. After validating action, add:

```js
    const rejectReason = req.body?.rejectReason;
    if (action === "reject" && rejectReason !== undefined && rejectReason !== "fake" && rejectReason !== "other") {
      return res.status(400).json({ error: "rejectReason must be fake or other" });
    }
```

Change the rejection `.select("id, status")` to `.select("id, status, attempt_id")`. After `if (!data) return 409`, before the success response, add:

```js
    if (rejectReason === "fake" && data.attempt_id) {
      try {
        await labelRiskAttempt(supabase, { orgId, attemptId: data.attempt_id, label: "fake" });
      } catch {
        console.warn("[OrderRisk] Could not label rejected review");
      }
    }
```

Do not label unlinked legacy reviews or ambiguous plain rejections.
- [ ] **Step 4: Run test to verify it passes.** Run: `npx vitest run src/test/orderProtectionReviewRoutes.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add server/index.js src/test/orderProtectionReviewRoutes.test.ts && git commit -m "feat: record fake review rejections"`

### Task 4: Admin manual label and allowlist

**Files:**
- Modify: `server/index.js` Order Protection Review Queue section
- Test: `src/test/orderRiskManualLabelWiring.test.ts`

**Interfaces:**
- Consumes verbatim: `getRiskAttempt(supabase, { orgId, attemptId })`, `labelRiskAttempt(supabase, { orgId, attemptId, label })`, `createListEntries(supabase, { orgId, list, entries, reason, sourceAttemptId, createdBy })`, `buildDisplayHint` from Plan E `server/risk/serialize.js`.
- Produces verbatim: `POST /api/order-protection/attempts/:id/label` `{ label: "fake"|"genuine" }` → `{ attempt }`.

- [ ] **Step 1: Write failing source-wiring test.**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync("server/index.js", "utf8");
describe("manual label route", () => {
  it("authenticates, guards workspace, labels, and allowlists genuine identities", () => {
    const start = source.indexOf('app.post("/api/order-protection/attempts/:id/label"');
    expect(start).toBeGreaterThanOrEqual(0);
    const route = source.slice(start, start + 2800);
    for (const text of ['requireOrderProtectionStaff(req)', 'if (!user)', 'role !== "admin"', 'getRiskAttempt(supabase, { orgId, attemptId: req.params.id })', 'labelRiskAttempt(supabase, { orgId, attemptId: req.params.id, label })', 'createListEntries(supabase, {', 'list: "allow"', 'reason: "Marked genuine"', 'sourceAttemptId: attempt.id', 'createdBy: user.id']) expect(route).toContain(text);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** Run: `npx vitest run src/test/orderRiskManualLabelWiring.test.ts`. Expected: FAIL (route missing).
- [ ] **Step 3: Write minimal implementation.** Import store helpers and `buildDisplayHint` from Plan E. Add route in Order Protection Review Queue section:

```js
app.post("/api/order-protection/attempts/:id/label", async (req, res) => {
  try {
    const { user, supabase, orgId, role } = await requireOrderProtectionStaff(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (role !== "admin") return res.status(403).json({ error: "Admin required" });
    const label = req.body?.label;
    if (label !== "fake" && label !== "genuine") return res.status(400).json({ error: "Invalid label" });
    const attempt = await getRiskAttempt(supabase, { orgId, attemptId: req.params.id });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (label === "genuine") {
      const entries = ["phone", "device"].filter((kind) => attempt[`${kind}_hash`]).map((kind) => ({
        kind, valueHash: attempt[`${kind}_hash`], displayHint: buildDisplayHint(kind, attempt),
      }));
      if (entries.length) await createListEntries(supabase, {
        orgId, list: "allow", entries, reason: "Marked genuine", sourceAttemptId: attempt.id, createdBy: user.id,
      });
    }
    await labelRiskAttempt(supabase, { orgId, attemptId: req.params.id, label });
    return res.json({ attempt: await getRiskAttempt(supabase, { orgId, attemptId: req.params.id }) });
  } catch (error) { return sendError(res, error); }
});
```

Adapt only the private `entries` object field casing and `buildDisplayHint` call to Plan E's concrete implementation; the shared store method names and argument shapes remain fixed. Never send unhashed identifiers from the browser. Genuine label failure must not return success; repeat allowlist writes are idempotent under Plan C uniqueness.
- [ ] **Step 4: Run test to verify it passes.** Run: `npx vitest run src/test/orderRiskManualLabelWiring.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add server/index.js src/test/orderRiskManualLabelWiring.test.ts && git commit -m "feat: let admins label and allowlist genuine attempts"`

### Task 5: Block confirmation, reject-as-fake and genuine UI

**Files:**
- Create: `src/components/risk/RiskBlockSuggestionDialog.tsx`
- Modify: `src/pages/OrderDetail.tsx`, `src/components/OrdersTable.tsx`, `src/components/OrderProtectionReviewQueue.tsx`, `src/lib/orderProtection.ts`, `src/lib/orderRisk.ts`, `src/components/risk/RiskDetailsContent.tsx`
- Test: `src/test/riskFeedbackUI.test.tsx`, `src/test/orderProtectionPage.test.tsx`

**Interfaces:**
- Consumes: order PATCH `riskBlockSuggestion: { attemptId }`; `POST /api/order-protection/lists` `{ attemptId, list: "block", kinds: Array<"phone"|"device"|"network">, reason }`; Task 4 label route; review PATCH `rejectReason`.
- Produces: `RiskBlockSuggestionDialog({ attemptId: string|null, onClose: () => void })`.

- [ ] **Step 1: Write failing UI tests.**

```tsx
// src/test/riskFeedbackUI.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));
import { RiskBlockSuggestionDialog } from "@/components/risk/RiskBlockSuggestionDialog";
describe("fake cancellation follow-up", () => {
  it("requires a second confirmation and sends selected kinds", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ entries: [] }) });
    const onClose = vi.fn();
    render(<RiskBlockSuggestionDialog attemptId="attempt-1" onClose={onClose} />);
    const user = userEvent.setup();
    expect(screen.getByText("Block this customer's phone, device and network?")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: "Network" }));
    await user.click(screen.getByRole("button", { name: "Block selected" }));
    expect(apiFetch).toHaveBeenCalledWith("/api/order-protection/lists", expect.objectContaining({
      method: "POST", body: JSON.stringify({ attemptId: "attempt-1", list: "block", kinds: ["phone", "device"], reason: "Staff confirmed fake cancellation" }),
    }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

Add to `orderProtectionPage.test.tsx`:

```tsx
test("offers explicit fake rejection without changing ordinary reject", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);
  await user.click(await screen.findByRole("button", { name: /reject as fake/i }));
  expect(updateProtectionReview).toHaveBeenCalledWith("review-1", "reject", "fake");
});
```

- [ ] **Step 2: Run tests to verify failure.** Run: `npx vitest run src/test/riskFeedbackUI.test.tsx src/test/orderProtectionPage.test.tsx`. Expected: FAIL (dialog/action missing).
- [ ] **Step 3: Implement shared dialog.**

```tsx
// src/components/risk/RiskBlockSuggestionDialog.tsx
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
type Kind = "phone" | "device" | "network";
export function RiskBlockSuggestionDialog({ attemptId, onClose }: { attemptId: string | null; onClose: () => void }) {
  const [kinds, setKinds] = useState<Kind[]>(["phone", "device", "network"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function block() {
    if (!attemptId || !kinds.length || busy) return;
    setBusy(true); setError("");
    try {
      const res = await apiFetch("/api/order-protection/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId, list: "block", kinds, reason: "Staff confirmed fake cancellation" }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not block these identities");
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not block these identities"); }
    finally { setBusy(false); }
  }
  return <AlertDialog open={Boolean(attemptId)} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Block this customer's phone, device and network?</AlertDialogTitle><AlertDialogDescription>Choose which identities should be blocked for future checkouts.</AlertDialogDescription></AlertDialogHeader>
      <div className="space-y-3">{(["phone", "device", "network"] as Kind[]).map((kind) => <label key={kind} className="flex items-center gap-2 text-sm"><Checkbox checked={kinds.includes(kind)} onCheckedChange={(checked) => setKinds((current) => checked === true ? [...current, kind].filter((value, index, all) => all.indexOf(value) === index).sort((a, b) => ["phone", "device", "network"].indexOf(a) - ["phone", "device", "network"].indexOf(b)) : current.filter((value) => value !== kind))} />{kind[0].toUpperCase() + kind.slice(1)}</label>)}</div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Skip</AlertDialogCancel><AlertDialogAction disabled={busy || kinds.length === 0} onClick={(event) => { event.preventDefault(); void block(); }}>Block selected</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
```

In both order surfaces add `const [riskBlockAttemptId, setRiskBlockAttemptId] = useState<string | null>(null);`, render `<RiskBlockSuggestionDialog attemptId={riskBlockAttemptId} onClose={() => setRiskBlockAttemptId(null)} />`, and only after the successful status PATCH JSON set the attempt ID if present. Gate the block dialog with `useUserRole().isAdmin` because the Lists mutation is admin-only; team members still receive the saved cancellation. In `OrderDetail.save`, capture the suggestion from `totalsJson` before clearing the reason, then use `if (suggestedAttemptId && isAdmin) setRiskBlockAttemptId(suggestedAttemptId); else if (!hasPendingNav) goBack();`; do not navigate away before confirmation. In `OrdersTable.handleStatusChange`, use `if (data.riskBlockSuggestion?.attemptId && isAdmin) setRiskBlockAttemptId(data.riskBlockSuggestion.attemptId);` after `res.ok` and keep the dialog separate from the cancellation dialog.

Change the existing review client to:

```ts
export async function updateProtectionReview(reviewId: string, action: "approve" | "reject" | "open" | "contacted", rejectReason?: "fake" | "other") {
  const response = await apiFetch(`/api/order-protection/reviews/${encodeURIComponent(reviewId)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(action === "reject" && rejectReason ? { rejectReason } : {}) }),
  });
  return readApiResponse<{ success: boolean; decision: string; orderRef?: string }>(response);
}
```

Add `rejectReason?: "fake"|"other"` to queue `handleAction`, pass it to `updateProtectionReview(reviewId, action, rejectReason)`, and place a second button alongside Reject:

```tsx
<button type="button" className={cn(actionChip, actionChipNeutral)} disabled={isUpdating} onClick={() => void handleAction(review.id, "reject", "fake")}>Reject as fake</button>
```

In `src/lib/orderRisk.ts`, add an `apiFetch` wrapper returning `{ attempt }` for `POST /api/order-protection/attempts/:id/label` with `{ label: "genuine" }`; in `RiskDetailsContent`, use `useUserRole().isAdmin` to show `Mark genuine`, await this wrapper, refresh the attempt and Lists query, and display API errors. Use the same admin visibility and feedback conventions as Plan E actions. This labels and allowlists only after a deliberate click.
- [ ] **Step 4: Run tests to verify pass.** Run: `npx vitest run src/test/riskFeedbackUI.test.tsx src/test/orderProtectionPage.test.tsx src/test/ordersTableCancellationAudit.test.ts`. Expected: PASS. Add a focused component assertion for `Mark genuine` in the Plan E risk-details test with an admin role mock and an API response containing `{ attempt }`; verify team-member visibility is false.
- [ ] **Step 5: Commit.** `git add src/components/risk/RiskBlockSuggestionDialog.tsx src/pages/OrderDetail.tsx src/components/OrdersTable.tsx src/components/OrderProtectionReviewQueue.tsx src/lib/orderProtection.ts src/lib/orderRisk.ts src/components/risk/RiskDetailsContent.tsx src/test/riskFeedbackUI.test.tsx src/test/orderProtectionPage.test.tsx && git commit -m "feat: collect staff feedback and confirm identity blocks"`

### Task 6: Accuracy computation and bounded API

**Files:**
- Create: `server/risk/accuracy.js`
- Modify: `server/index.js` Order Protection Review Queue section
- Test: `src/test/orderRiskAccuracy.test.ts`, `src/test/orderRiskAccuracyWiring.test.ts`

**Interfaces:**
- Consumes: `SIGNAL_DEFINITIONS` from Plan D; `order_risk_attempts` fields `decision, signals, label, created_at, mode` from Plan C.
- Produces: `computeAccuracy(attempts, { now, days })` → `{ overall, signals }`; `GET /api/order-protection/accuracy?days=7|30` → `{ overall, signals }`.

- [ ] **Step 1: Write failing tests.**

```ts
// src/test/orderRiskAccuracy.test.ts
import { describe, expect, it } from "vitest";
import { computeAccuracy } from "../../server/risk/accuracy.js";
const now = new Date("2026-09-23T12:00:00Z");
const attempt = (decision: string, label: string | null, signals: string[] = [], mode = "shadow") => ({ decision, label, signals: signals.map((code) => ({ code })), mode, created_at: "2026-09-22T12:00:00Z" });
describe("accuracy", () => {
  it("includes shadow, excludes unknown from precision and counts fake outcomes", () => {
    const { overall, signals } = computeAccuracy([attempt("BLOCK", "fake", ["test_content"]), attempt("BLOCK", "genuine", ["test_content"], "active"), attempt("HOLD", "fake", ["address_incomplete"]), attempt("ALLOW", "fake"), attempt("ALLOW", null)], { now, days: 7 });
    expect(overall).toMatchObject({ attempts: 5, holds: 1, blocks: 2, holdRate: 0.2, labelledFake: 3, labelledGenuine: 1, blockPrecision: 0.5, blockedGenuine: 1, fakeCaught: 2 / 3, fakeSlipped: 1 });
    expect(signals.find((signal: { code: string }) => signal.code === "test_content")).toMatchObject({ fired: 2, fake: 1, genuine: 1, precisionFake: 0.5 });
    expect(overall.targets.blockPrecision).toEqual({ value: 0.5, target: 0.97, pass: false });
  });
  it("returns null where no ground truth exists", () => {
    const { overall, signals } = computeAccuracy([attempt("BLOCK", null, ["test_content"])], { now, days: 30 });
    expect(overall.blockPrecision).toBeNull();
    expect(overall.targets.blockPrecision.pass).toBeNull();
    expect(signals.find((signal: { code: string }) => signal.code === "test_content")?.precisionFake).toBeNull();
  });
});
```

```ts
// src/test/orderRiskAccuracyWiring.test.ts
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const source = readFileSync("server/index.js", "utf8");
it("pages scoped accuracy rows through 5000 and validates window", () => {
  const start = source.indexOf('app.get("/api/order-protection/accuracy"');
  expect(start).toBeGreaterThanOrEqual(0);
  const route = source.slice(start, start + 2400);
  for (const token of ['requireOrderProtectionStaff(req)', 'if (!user)', '[7, 30].includes(days)', '.from("order_risk_attempts")', '.select("id, decision, signals, label, mode, created_at")', '.eq("org_id", orgId)', '.range(offset, offset + pageSize - 1)', 'rows.length < 5000', 'computeAccuracy(rows, { now, days })']) expect(route).toContain(token);
});
```

- [ ] **Step 2: Run tests to verify failure.** Run: `npx vitest run src/test/orderRiskAccuracy.test.ts src/test/orderRiskAccuracyWiring.test.ts`. Expected: FAIL (module/route missing).
- [ ] **Step 3: Implement pure calculation.**

```js
// server/risk/accuracy.js
import { SIGNAL_DEFINITIONS } from "./signals.js";
const ratio = (part, whole) => whole ? part / whole : null;
export function computeAccuracy(attempts, { now, days }) {
  const current = new Date(now).getTime();
  const cutoff = current - days * 86_400_000;
  const rows = attempts.filter((row) => { const time = new Date(row.created_at).getTime(); return Number.isFinite(time) && time >= cutoff && time <= current; });
  const named = new Map(Object.entries(SIGNAL_DEFINITIONS).map(([code, definition]) => [code, { code, label: definition.label, fired: 0, fake: 0, genuine: 0, precisionFake: null }]));
  for (const row of rows) for (const code of new Set((Array.isArray(row.signals) ? row.signals : []).map((signal) => signal?.code).filter(Boolean))) {
    if (!named.has(code)) named.set(code, { code, label: code, fired: 0, fake: 0, genuine: 0, precisionFake: null });
    const item = named.get(code);
    item.fired++;
    if (row.label === "fake" || row.label === "genuine") item[row.label]++;
  }
  const signals = [...named.values()].map((item) => ({ ...item, precisionFake: ratio(item.fake, item.fake + item.genuine) })).sort((a, b) => b.fired - a.fired || a.code.localeCompare(b.code));
  const fake = rows.filter((row) => row.label === "fake");
  const genuine = rows.filter((row) => row.label === "genuine");
  const blocked = rows.filter((row) => row.decision === "BLOCK" && (row.label === "fake" || row.label === "genuine"));
  const holds = rows.filter((row) => row.decision === "HOLD").length;
  const blockPrecision = ratio(blocked.filter((row) => row.label === "fake").length, blocked.length);
  const holdRate = ratio(holds, rows.length);
  const fakeCaught = ratio(fake.filter((row) => row.decision === "HOLD" || row.decision === "BLOCK").length, fake.length);
  return { overall: {
    attempts: rows.length, holds, blocks: rows.filter((row) => row.decision === "BLOCK").length, holdRate,
    labelledFake: fake.length, labelledGenuine: genuine.length, blockPrecision,
    blockedGenuine: blocked.filter((row) => row.label === "genuine").length,
    fakeCaught, fakeSlipped: fake.filter((row) => row.decision === "ALLOW").length,
    targets: {
      blockPrecision: { value: blockPrecision, target: 0.97, pass: blockPrecision === null ? null : blockPrecision >= 0.97 },
      holdRate: { value: holdRate, target: 0.15, pass: holdRate === null ? null : holdRate <= 0.15 },
      fakeCaught: { value: fakeCaught, target: 0.70, pass: fakeCaught === null ? null : fakeCaught >= 0.70 },
    },
  }, signals };
}
```

Add `import { computeAccuracy } from "./risk/accuracy.js";` and this route in the dashboard domain section:

```js
app.get("/api/order-protection/accuracy", async (req, res) => {
  try {
    const { user, supabase, orgId } = await requireOrderProtectionStaff(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const days = Number(req.query.days ?? 7);
    if (![7, 30].includes(days)) return res.status(400).json({ error: "days must be 7 or 30" });
    const now = new Date();
    const since = new Date(now.getTime() - days * 86_400_000).toISOString();
    const rows = [];
    const pageSize = 500;
    for (let offset = 0; rows.length < 5000; offset += pageSize) {
      const { data, error } = await supabase.from("order_risk_attempts")
        .select("id, decision, signals, label, mode, created_at")
        .eq("org_id", orgId).gte("created_at", since).lte("created_at", now.toISOString())
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      rows.push(...(data || []).slice(0, 5000 - rows.length));
      if (!data || data.length < pageSize) break;
    }
    return res.json(computeAccuracy(rows, { now, days }));
  } catch (error) { return sendError(res, error); }
});
```

- [ ] **Step 4: Run tests to verify pass.** Run: `npx vitest run src/test/orderRiskAccuracy.test.ts src/test/orderRiskAccuracyWiring.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add server/risk/accuracy.js server/index.js src/test/orderRiskAccuracy.test.ts src/test/orderRiskAccuracyWiring.test.ts && git commit -m "feat: report labelled risk accuracy"`

### Task 7: Accuracy tab

**Files:**
- Create: `src/components/risk/RiskAccuracyPanel.tsx`
- Modify: `src/pages/OrderProtection.tsx`, `src/lib/orderRisk.ts`
- Test: `src/test/riskAccuracyPanel.test.tsx`

**Interfaces:**
- Consumes: `GET /api/order-protection/accuracy?days=7|30` `{ overall, signals }` from Task 6; Plan E Accuracy-tab extension point.
- Produces: `<RiskAccuracyPanel />` with target status, per-signal accuracy and window toggle.

- [ ] **Step 1: Write failing UI test.**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));
import { RiskAccuracyPanel } from "@/components/risk/RiskAccuracyPanel";
describe("Accuracy tab", () => {
  it("shows targets, signal outcomes and switches the window", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ overall: { attempts: 3, holds: 1, blocks: 1, labelledFake: 1, labelledGenuine: 1, fakeSlipped: 0, targets: { blockPrecision: { value: 1, target: .97, pass: true }, holdRate: { value: 1 / 3, target: .15, pass: false }, fakeCaught: { value: 1, target: .70, pass: true } } }, signals: [{ code: "test_content", label: "Test/fake details", fired: 2, fake: 1, genuine: 1, precisionFake: .5 }] }) });
    render(<RiskAccuracyPanel />);
    expect(await screen.findByText("Test/fake details")).toBeInTheDocument();
    expect(screen.getByText(/Labels come from recorded fake cancellations/i)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "30 days" }));
    expect(apiFetch).toHaveBeenCalledWith("/api/order-protection/accuracy?days=30");
  });
});
```

- [ ] **Step 2: Run test to verify failure.** Run: `npx vitest run src/test/riskAccuracyPanel.test.tsx`. Expected: FAIL (component missing).
- [ ] **Step 3: Implement panel and tab.**

```tsx
// src/components/risk/RiskAccuracyPanel.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
type Target = { value: number | null; target: number; pass: boolean | null };
type Accuracy = { overall: { attempts: number; holds: number; blocks: number; labelledFake: number; labelledGenuine: number; fakeSlipped: number; targets: Record<"blockPrecision" | "holdRate" | "fakeCaught", Target> }; signals: { code: string; label: string; fired: number; fake: number; genuine: number; precisionFake: number | null }[] };
const percent = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;
export function RiskAccuracyPanel() {
  const [days, setDays] = useState<7 | 30>(7);
  const { data, isLoading, error } = useQuery<Accuracy>({ queryKey: ["order-protection-accuracy", days], queryFn: async () => {
    const response = await apiFetch(`/api/order-protection/accuracy?days=${days}`);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "Could not load accuracy");
    return json as Accuracy;
  } });
  return <section className="space-y-6 bg-[#FAFAF8] p-3"><div className="flex gap-2">{([7, 30] as const).map((value) => <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)} className="rounded-lg bg-black/[0.05] px-3 py-2 text-sm">{value} days</button>)}</div>
    <p className="text-sm text-black/60">Labels come from recorded fake cancellations, fake review rejections, delivered orders, or an admin marking an attempt genuine. Unknown outcomes are excluded from precision.</p>
    {isLoading && <p>Loading accuracy…</p>}{error && <p role="alert">{error.message}</p>}
    {data && <><div className="grid gap-4 sm:grid-cols-3">{(["blockPrecision", "holdRate", "fakeCaught"] as const).map((key) => { const target = data.overall.targets[key]; return <div key={key} className="p-3"><h3 className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">{key === "blockPrecision" ? "Block precision" : key === "holdRate" ? "Hold rate" : "Fake caught"}</h3><p className="text-2xl font-light">{percent(target.value)}</p><p className="text-xs">{target.pass === null ? "Insufficient labels" : target.pass ? "Pass" : "Below target"} · target {percent(target.target)}</p></div>; })}</div>
      <p className="text-sm">{data.overall.attempts} attempts · {data.overall.labelledFake} fake · {data.overall.labelledGenuine} genuine · {data.overall.fakeSlipped} fake allowed</p>
      <table className="w-full text-left text-sm"><thead><tr><th>Signal</th><th>Fired</th><th>Fake</th><th>Genuine</th><th>Fake share</th></tr></thead><tbody>{[...data.signals].sort((a, b) => b.fired - a.fired).map((signal) => <tr key={signal.code}><td>{signal.label}</td><td>{signal.fired}</td><td>{signal.fake}</td><td>{signal.genuine}</td><td>{percent(signal.precisionFake)}</td></tr>)}</tbody></table></>}
  </section>;
}
```

Mount `<RiskAccuracyPanel />` at the Plan E Accuracy-tab extension point in `src/pages/OrderProtection.tsx`, preserving its Held default and other tabs. For narrow screens wrap the table in `overflow-x-auto`; include visible target thresholds and `role="alert"` on errors. The panel's `apiFetch` call may be moved to the existing `src/lib/orderRisk.ts` client wrapper used by Plan E, keeping identical response typing and query key.
- [ ] **Step 4: Run test to verify pass.** Run: `npx vitest run src/test/riskAccuracyPanel.test.tsx src/test/orderProtectionPage.test.tsx`. Expected: PASS with Plan E tab mounted.
- [ ] **Step 5: Commit.** `git add src/components/risk/RiskAccuracyPanel.tsx src/pages/OrderProtection.tsx src/lib/orderRisk.ts src/test/riskAccuracyPanel.test.tsx && git commit -m "feat: show risk accuracy and rollout targets"`

### Task 8: Daily PII retention

**Files:**
- Modify: `server/index.js:2942-2992`
- Test: `src/test/orderRiskRetentionWiring.test.ts`

**Interfaces:**
- Consumes verbatim: `scrubExpiredRiskAttempts(supabase, { now = new Date() })` (Plan C); `scrubExpiredProtectionData({ supabase, now = new Date().toISOString() })` (existing `server/orderProtectionStore.js`).
- Produces: existing CRON_SECRET-protected `/api/internal/abandoned-checkouts-maintenance` also scrubs expired risk attempts and reviews.

- [ ] **Step 1: Write failing source-wiring test.**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const server = readFileSync("server/index.js", "utf8");
const vercel = readFileSync("vercel.json", "utf8");
describe("risk retention", () => {
  it("uses the existing authenticated daily cron for risk and review PII", () => {
    const worker = server.slice(server.indexOf("async function runAbandonedCheckoutMaintenance"), server.indexOf('app.get("/api/internal/abandoned-checkouts-maintenance"'));
    const route = server.slice(server.indexOf('app.get("/api/internal/abandoned-checkouts-maintenance"'), server.indexOf("// Apex (<=2 labels"));
    expect(worker).toContain("scrubExpiredRiskAttempts(supabase, { now })");
    expect(worker).toContain("scrubExpiredProtectionData({ supabase, now: now.toISOString() })");
    expect(route).toContain("isAuthorizedCronRequest(req.headers.authorization, process.env.CRON_SECRET)");
    expect(vercel).toContain('"/api/internal/abandoned-checkouts-maintenance"');
  });
});
```

- [ ] **Step 2: Run test to verify failure.** Run: `npx vitest run src/test/orderRiskRetentionWiring.test.ts`. Expected: FAIL (scrub calls missing).
- [ ] **Step 3: Implement minimal wiring.** Import both scrub functions. Inside `runAbandonedCheckoutMaintenance`, after abandoned-checkout scrub succeeds, insert:

```js
  const riskScrubbed = await scrubExpiredRiskAttempts(supabase, { now });
  const reviewsScrubbed = await scrubExpiredProtectionData({ supabase, now: now.toISOString() });
  return { scannedWorkspaces: orgIds.length, recovered, expired: expired || 0, scrubbed: scrubbed || 0, riskScrubbed, reviewsScrubbed };
```

Replace its previous return only. The Plan C store owns the 30-day PII scrub and 180-day aggregate retention. `scrubExpiredProtectionData` currently scrubs only on-hold reviews; extend its store helper to scrub *all* expired review statuses without overwriting status of approved/rejected reviews, and ensure repeated runs are idempotent. Add a store unit test before that change if Plan C has not already made it; do not expose old review PII in an Accuracy response.
- [ ] **Step 4: Run test to verify pass.** Run: `npx vitest run src/test/orderRiskRetentionWiring.test.ts src/test/abandonedCheckoutMaintenanceWiring.test.ts src/test/orderProtectionStore.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add server/index.js server/orderProtectionStore.js src/test/orderRiskRetentionWiring.test.ts src/test/orderProtectionStore.test.ts && git commit -m "feat: scrub expired protection data in daily maintenance"`

### Task 9: Rollout runbook, changelog and verification

**Files:**
- Modify: `docs/runbooks/order-protection.md`, `CHANGELOG.md`
- Test: `src/test/orderRiskRunbook.test.ts`

**Interfaces:**
- Consumes: mode contract §1, API contracts §12, retention §10.1 and design §9/§13.
- Produces: operator instructions; no deployment or live migration.

- [ ] **Step 1: Write failing documentation assertion.**

```ts
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("documents the shadow gate, secret boundary and reversible rollout", () => {
  const runbook = readFileSync("docs/runbooks/order-protection.md", "utf8");
  for (const value of ["ORDER_PROTECTION_MODE", "STOREFRONT_CONTEXT_SECRET", "ORDER_PROTECTION_HASH_SECRET", "TURNSTILE_SECRET_KEY", "TURNSTILE_SITE_KEY", "VITE_TURNSTILE_SITE_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "7 days", "97%", "15%", "70%", "scripts/build-bd-locations.mjs", "scripts/build-bd-networks.mjs", "npm run verify:supabase-project", "npm run verify:supabase-baseline", "Accuracy", "Lists", "off"]) expect(runbook).toContain(value);
  expect(runbook).not.toContain("AI failures fail closed");
});
```

- [ ] **Step 2: Run test to verify failure.** Run: `npx vitest run src/test/orderRiskRunbook.test.ts`. Expected: FAIL on old AI/secret instructions.
- [ ] **Step 3: Replace runbook with exact operator text and add a changelog entry.**

```markdown
# Order protection runbook (v2)

## Configuration and boundaries

Merchant Suite Vercel: `ORDER_PROTECTION_MODE=shadow` initially; `ORDER_PROTECTION_HASH_SECRET` (stable random secret; rotate only with a planned hash/list transition); `STOREFRONT_CONTEXT_SECRET` (at least 32 characters); `TURNSTILE_SECRET_KEY`; `TURNSTILE_SITE_KEY`; `UPSTASH_REDIS_REST_URL`; `UPSTASH_REDIS_REST_TOKEN`; `CRON_SECRET`. Storefront Vercel: the *same* `STOREFRONT_CONTEXT_SECRET`, `VITE_TURNSTILE_SITE_KEY`, and the configured Merchant Suite API URL/handle. Never expose server secrets through `VITE_` variables.

`ORDER_PROTECTION_MODE=off` (or `disabled`) is the emergency kill switch and overrides Settings; `shadow` records decisions but accepts valid orders; `active` enforces HOLD/BLOCK. If no valid env override exists, Settings mode applies and otherwise defaults to shadow. Keep signed context and hash secrets aligned across deployments; never print raw identifiers.

## Schema and datasets

Through the normal ship workflow, first verify the linked project with `npm run verify:supabase-project`, then verify the canonical baseline with `npm run verify:supabase-baseline`. Apply the Plan A migration before the Plan C migration in migration filename order; inspect each migration and its baseline checks before scheduling deployment. Never run schema DDL from application startup or use archived `supabase/legacy-migrations/`. The deployment operator applies migrations; the implementation agent does not run remote migrations. Refresh committed Bangladesh dictionaries quarterly with `scripts/build-bd-locations.mjs` and `scripts/build-bd-networks.mjs`, review generated diffs and pinned source versions, then ship through the normal PR process.

## Staff feedback and retention

Every staff cancellation needs a recorded reason. `fraud_or_suspicious` and `test_or_fake_order` label a linked attempt fake and offer an *optional, separate confirmation* to block phone, device and network. Held reviews can be rejected as fake; plain rejections remain unknown. Delivered and delivered_approval_pending courier statuses label linked attempts genuine. Admins can Mark genuine in risk details, which allowlists the available phone and device hashes. Unblock a customer from Order Protection → Lists by removing the affected block entry; check allow entries and the linked risk attempt before retrying. Staff never copy raw identifiers into logs.

The CRON_SECRET-authenticated `/api/internal/abandoned-checkouts-maintenance` job runs daily from `vercel.json`. It scrubs expired risk-attempt personal fields after 30 days and review personal fields after expiry; hashes, signals and decisions are retained up to 180 days for accuracy reporting. Monitor cron failures without recording customer data.

## Rollout gate

1. Deploy both applications and migrations through approved shipping with `ORDER_PROTECTION_MODE=shadow`. Do not test with real orders or customer phones.
2. Collect **7 days** of outcomes. Open Order Protection → Accuracy for 7/30-day windows and inspect labelled sample size, individual signals, false blocks and missing labels. Historical cancellations without reasons are unknown (131 of 140 recent website cancellations); never treat them as fake.
3. Require block precision **≥ 97%**, hold rate **≤ 15%**, and fake caught **≥ 70%** before switching. Insufficient labelled BLOCK/fake samples are not a pass. Tune constants in code based on per-signal evidence, review, test and deploy a fresh shadow observation period if changed.
4. With targets met, change Settings mode to Active. Check hold rate, blocked-genuine reports, block precision and cron health **daily for the first week**, then weekly. Investigate any genuine block and remove mistaken entries in Lists.
5. If checkout outcomes degrade, set `ORDER_PROTECTION_MODE=off` in Merchant Suite Vercel as the emergency kill switch and redeploy via the normal operator process; diagnose before restoring shadow, then active. No AI check participates in checkout. Dependency failures yield HOLD, never BLOCK.
```

Prepend to `CHANGELOG.md` immediately below `# Changelog`, using the repository's actual next release number (after current VERSION; the ship workflow owns the bump):

```markdown
## [0.1.0.32] - 2026-09-23

### Added

- Added staff and courier ground-truth labels, explicit fake-order block confirmation, admin genuine allowlisting, and a 7/30-day Order Protection Accuracy tab.
- Added daily risk-attempt and held-review personal-data scrubbing with a shadow-to-active rollout runbook.
```

If another phase already advanced `VERSION`/`CHANGELOG.md`, use that phase's next version instead of creating a duplicate heading.
- [ ] **Step 4: Run test and final checks.** Run: `npx vitest run src/test/orderRiskRunbook.test.ts && npm test && npm run lint && npm run build`. Expected: all PASS. Also run `git diff --check` and inspect the diff for only Plan F files; do not deploy, mutate production env, apply remote migrations or submit an order.
- [ ] **Step 5: Commit.** `git add docs/runbooks/order-protection.md CHANGELOG.md src/test/orderRiskRunbook.test.ts && git commit -m "docs: record risk rollout and monitoring playbook"`

## Contract notes and risks

- The shared §10 store signature is `createListEntries(supabase, { orgId, list, entries, reason, sourceAttemptId, createdBy })`. Confirm Plan C's private `entries` item property casing and Plan E's `buildDisplayHint` signature before implementing Task 4; do not change the shared signature. The design spec mentions `source_order_id`, but the shared contract fixes `source_attempt_id`.
- Accuracy is bounded to the newest 5,000 rows. If a 7/30-day window exceeds that cap, show an explicit sampled/truncated notice before using it as an activation gate; add a contract extension for `truncated` if needed rather than silently treating partial coverage as store-wide precision.
- `scrubExpiredProtectionData` currently scrubs only `on_hold` rows. Approved/rejected review PII must also be scrubbed after expiry without rewriting their statuses; the existing maintenance cron did not call it.
- Courier polls currently do not check update errors. Task 2 must verify write success before labelling. Only an authenticated/secret-verified webhook may label a delivery, and `partial_delivered` is not the contract's `delivered` ground truth.
- Manual labels can conflict with later courier outcomes. Establish a deterministic precedence/idempotency policy in Plan C's `labelRiskAttempt` (ideally preserve a reviewed manual label or explicit correction) before activating metrics; do not silently overwrite a confirmed fake with a later event.
