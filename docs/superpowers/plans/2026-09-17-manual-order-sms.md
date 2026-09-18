# Manual Order Confirmed SMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manual Create Order submissions send the merchant's "confirmed" Bengali SMS via BulkSMS BD instead of the storefront confirmation wording.

**Architecture:** Extend the existing `sendBulkSms(orgId, type, order)` helper (`server/index.js:925`) with a `manual_confirmation` type (new template + toggle keys, same gateway and silent-skip semantics), switch the `POST /api/orders` call site to it, and expose the template + toggle in `BulkSmsSection.tsx`. No new provider, no schema change, no order-flow change.

**Tech Stack:** Express (ESM), React 18 + TypeScript (strict), Vitest.

## Global Constraints

- Every new route that reads or writes user data MUST use the current Mango Lover BD workspace and preserve the `org_id` guard in all relevant queries — no new routes in this plan.
- Always use `apiFetch()` from `src/lib/api.ts` — no new API calls in this plan.
- Never commit `.env` or secrets.
- SMS failure must never fail order creation (existing try/catch + silent skip).
- TypeScript strict — no `any` without a documented comment.

---

## File Structure

- Modify `server/index.js:925-973` — `manual_confirmation` branch in `sendBulkSms`.
- Modify `server/index.js:7246` — call site in `POST /api/orders`.
- Modify `src/components/BulkSmsSection.tsx` — template textarea + toggle.
- Modify `src/test/sendBulkSms.test.ts` — update dashboard-create assertion, add new-type assertions.
- Modify `src/test/bulkSmsSettingsUI.test.tsx` — cover the new template + toggle.

---

### Task 1: `manual_confirmation` SMS type + call-site switch

**Files:**
- Modify: `server/index.js:925-973`, `server/index.js:7246`
- Test: `src/test/sendBulkSms.test.ts`

**Interfaces:**
- Consumes: `getSettings`, `submitBulkSmsMessage`, `bulksms_*` settings (existing).
- Produces: `sendBulkSms(orgId, "manual_confirmation", order)` consumed by Task 2's UI (template/toggle keys only).

- [ ] **Step 1: Write the failing test**

In `src/test/sendBulkSms.test.ts`, update the dashboard-create test (line 61-66) to:

```ts
  it("sends manual-confirmation SMS after dashboard order creation completes", () => {
    expect(orderCreateSource).toContain('await sendBulkSms(orgId, "manual_confirmation", data);');
    expect(orderCreateSource.indexOf('await sendBulkSms(orgId, "manual_confirmation", data);')).toBeGreaterThan(
      orderCreateSource.indexOf('.from("orders")'),
    );
    expect(orderCreateSource).not.toContain('sendBulkSms(orgId, "confirmation"');
  });
```

And append inside the same `describe` block:

```ts
  it("supports an independent manual-confirmation template switch", () => {
    expect(serverSource).toContain('`${orgId}:bulksms_manual_confirmation_template`');
    expect(serverSource).toContain('`${orgId}:bulksms_manual_confirmation_enabled`');
    expect(serverSource).toContain('type === "manual_confirmation"');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/sendBulkSms.test.ts`
Expected: FAIL — `manual_confirmation` not found; old `confirmation` call still present

- [ ] **Step 3: Write minimal implementation**

In `server/index.js`, add the two keys to the `keys` array in `sendBulkSms`:

```js
      `${orgId}:bulksms_manual_confirmation_template`,
      `${orgId}:bulksms_manual_confirmation_enabled`,
```

Replace the `templateEnabled` ternary with:

```js
    const templateEnabled = type === "confirmation"
      ? settings[`${orgId}:bulksms_confirmation_enabled`]
      : type === "manual_confirmation"
        ? settings[`${orgId}:bulksms_manual_confirmation_enabled`]
        : type === "dispatch"
          ? settings[`${orgId}:bulksms_dispatch_enabled`]
          : "false";
```

Extend the template selection with:

```js
    } else if (type === "manual_confirmation") {
      template = settings[`${orgId}:bulksms_manual_confirmation_template`] || "";
    }
```

At the `POST /api/orders` call site, change exactly:

```js
    await sendBulkSms(orgId, "confirmation", data);
```

to:

```js
    await sendBulkSms(orgId, "manual_confirmation", data);
```

Do NOT touch the storefront webhook call (`await sendBulkSms(orgId, "confirmation", persistedOrder);`), dispatch calls, or inbox calls.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/sendBulkSms.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/index.js src/test/sendBulkSms.test.ts
git commit -m "feat: send manual-confirmation SMS for dashboard orders"
```

---

### Task 2: Settings template + toggle UI

**Files:**
- Modify: `src/components/BulkSmsSection.tsx`
- Test: `src/test/bulkSmsSettingsUI.test.tsx`

**Interfaces:**
- Consumes: `/api/settings` GET/POST via `apiFetch`; key names from Task 1.
- Produces: persisted `bulksms_manual_confirmation_template` + `bulksms_manual_confirmation_enabled` read by `sendBulkSms`. No downstream consumers.

- [ ] **Step 1: Read the existing UI test, then write the failing test**

First read `src/test/bulkSmsSettingsUI.test.tsx` fully and follow its render/mock pattern. Add coverage asserting:
1. The section renders a "Manual Order Template" textarea (label `htmlFor="bulksms-manual-confirmation-enabled"`, switch `aria-label="Enable Manual Order SMS"`) defaulting to the Bengali template below when settings are absent.
2. Saving POSTs `bulksms_manual_confirmation_template` and `bulksms_manual_confirmation_enabled` through `/api/settings`.

Default template (exact, merchant-provided):

```
আসসালামু আলাইকুম {customer_name}, আপনার {order_id} অর্ডারটি কনফার্ম করা হয়েছে। খুব শীঘ্রই অর্ডারটি পেয়ে যাবেন, ইনশাআল্লাহ।— ম্যাংগো লাভার
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/bulkSmsSettingsUI.test.tsx`
Expected: FAIL — manual template controls not found

- [ ] **Step 3: Write minimal implementation**

In `src/components/BulkSmsSection.tsx`, mirroring the confirmation block exactly:

```tsx
const DEFAULT_MANUAL_CONFIRMATION_TEMPLATE =
  "আসসালামু আলাইকুম {customer_name}, আপনার {order_id} অর্ডারটি কনফার্ম করা হয়েছে। খুব শীঘ্রই অর্ডারটি পেয়ে যাবেন, ইনশাআল্লাহ।— ম্যাংগো লাভার";
```

State (next to the other template states):

```tsx
  const [bulkSmsManualConfirmationTemplate, setBulkSmsManualConfirmationTemplate] = useState(DEFAULT_MANUAL_CONFIRMATION_TEMPLATE);
  const [bulkSmsManualConfirmationEnabled, setBulkSmsManualConfirmationEnabled] = useState(true);
```

Load (inside the `if (data.settings)` block):

```tsx
          setBulkSmsManualConfirmationTemplate(data.settings["bulksms_manual_confirmation_template"] || DEFAULT_MANUAL_CONFIRMATION_TEMPLATE);
          setBulkSmsManualConfirmationEnabled(data.settings["bulksms_manual_confirmation_enabled"] !== "false");
```

Save (inside the `settings` object):

```tsx
            bulksms_manual_confirmation_template: bulkSmsManualConfirmationTemplate,
            bulksms_manual_confirmation_enabled: bulkSmsManualConfirmationEnabled.toString(),
```

JSX block placed directly after the confirmation-template block (lines 127-144), identical structure with `htmlFor="bulksms-manual-confirmation-enabled"`, label text `Manual Order Template`, switch `aria-label="Enable Manual Order SMS"`, textarea placeholder `"e.g. Hello {customer_name}, order {order_id} is confirmed and arriving soon."`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/bulkSmsSettingsUI.test.ts src/test/bulkSmsSettingsUI.test.tsx`
Expected: PASS (run both extensions; only the existing one runs)

- [ ] **Step 5: Commit**

```bash
git add src/components/BulkSmsSection.tsx src/test/bulkSmsSettingsUI.test.tsx
git commit -m "feat: add manual order SMS template settings"
```

---

### Task 3: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites PASS (in particular `sendBulkSms.test.ts`, `bulkSmsSettingsUI.test.tsx`, `orderCreatorModal.test.ts`)

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 4: Manual QA (localhost:5002, needs Bulk SMS enabled with test number)**

1. Settings → Integrations → Bulk SMS: confirm the Manual Order Template shows the Bengali default and its toggle is on; save.
2. Create Order with your own number → SMS arrives with confirmed wording and the real order number substituted.
3. Storefront test order → still receives the old "representative will call you" wording.
4. Disable the manual toggle → Create Order sends no SMS but still creates the order.

- [ ] **Step 5: Commit any fixes separately; do not batch unrelated changes**
