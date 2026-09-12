# Individual Order SMS and WhatsApp Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit one-off SMS and blank WhatsApp chat actions to the order editor without changing automated Bulk SMS confirmation or dispatch behavior.

**Architecture:** Keep WhatsApp client-only by generating a validated `wa.me` URL from the saved order phone. Add an authenticated `POST /api/orders/:id/send-sms` endpoint that loads the org-scoped order, validates the operator's freeform message, and submits it through shared Bulk SMS BD gateway logic. Keep the composer isolated in a focused order-editor component and preserve the existing CustomerPanel edit/apply workflow.

**Tech Stack:** React 18, TypeScript, React Router, Radix Dialog/shadcn UI, Phosphor Icons, `apiFetch`, Express, Supabase service client, Vitest, Testing Library.

## Global Constraints

- Use `apiFetch()` for the frontend SMS request.
- Every backend order query must resolve and filter by the fixed Mango Lover BD `org_id`.
- The backend must use the saved order phone; never accept a client-supplied recipient phone or organization id.
- Normalize Bangladesh phone numbers before sending SMS or creating WhatsApp URLs.
- Do not change automated confirmation or dispatch SMS triggers.
- Manual SMS messages are freeform, non-empty, and limited to 1,000 Unicode code points.
- Do not add a database migration, message history, delivery-status table, WhatsApp API send, or Settings template.
- Use Phosphor Icons with `weight="light"` for new interface icons and preserve the existing luxury-minimal styling.

---

### Task 1: Add shared client-side Bangladesh phone helpers

**Files:**
- Create: `src/lib/bdPhone.ts`
- Test: `src/test/bdPhone.test.ts`

**Interfaces:**
- Produces `normalizeBdPhone(phone: string | null | undefined): string | null`, returning an 11-digit local number (`01XXXXXXXXX`) or `null`.
- Produces `bdWhatsAppHref(phone: string | null | undefined): string | null`, returning `https://wa.me/8801XXXXXXXXX` or `null`.
- The normalization must mirror `server/abandonedCheckouts.js`: strip non-digits, accept valid `880...` and local formats, and reject all other values.

- [x] **Step 1: Write failing normalization and WhatsApp URL tests**

```ts
import { describe, expect, it } from "vitest";
import { bdWhatsAppHref, normalizeBdPhone } from "@/lib/bdPhone";

describe("Bangladesh phone helpers", () => {
  it("normalizes local and international input", () => {
    expect(normalizeBdPhone("01712345678")).toBe("01712345678");
    expect(normalizeBdPhone("+880 1712-345678")).toBe("01712345678");
    expect(normalizeBdPhone("8801712345678")).toBe("01712345678");
  });

  it("rejects invalid numbers", () => {
    expect(normalizeBdPhone("0181234567")).toBeNull();
    expect(normalizeBdPhone("01112345678")).toBeNull();
    expect(normalizeBdPhone(null)).toBeNull();
  });

  it("builds a blank WhatsApp chat URL", () => {
    expect(bdWhatsAppHref("01712345678")).toBe("https://wa.me/8801712345678");
    expect(bdWhatsAppHref("bad phone")).toBeNull();
  });
});
```

- [x] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- src/test/bdPhone.test.ts`

Expected: FAIL because `src/lib/bdPhone.ts` does not exist.

- [x] **Step 3: Implement the helpers**

```ts
export function normalizeBdPhone(phone: string | null | undefined): string | null {
  let clean = String(phone || "").replace(/\D/g, "");
  if (clean.startsWith("880")) {
    const after = clean.slice(3);
    if (after.startsWith("01") && after.length === 11) clean = after;
    else if (after.startsWith("1") && after.length === 10) clean = `0${after}`;
  }
  return clean.length === 11 && clean.startsWith("01") ? clean : null;
}

export function bdWhatsAppHref(phone: string | null | undefined): string | null {
  const normalized = normalizeBdPhone(phone);
  return normalized ? `https://wa.me/88${normalized}` : null;
}
```

- [x] **Step 4: Run the focused test and confirm it passes**

Run: `npm test -- src/test/bdPhone.test.ts`

Expected: PASS.

- [x] **Step 5: Commit the helper**

```bash
git add src/lib/bdPhone.ts src/test/bdPhone.test.ts
git commit -m "feat: add Bangladesh phone helpers"
```

### Task 2: Add the org-scoped manual Bulk SMS endpoint

**Files:**
- Modify: `server/index.js` near the existing `sendBulkSms` helper and authenticated `/api/orders/:id` routes
- Test: `src/test/individualOrderMessaging.test.ts`

**Interfaces:**
- Produces `POST /api/orders/:id/send-sms` with request body `{ message: string }`.
- The route loads `orders` by `id` and the authenticated Mango Lover BD `org_id`, then sends only to the stored `order.phone`.
- The route returns `401`, `404`, `422`, `409`, `502`, or `200` according to the approved design.
- Shared gateway submission must preserve Bulk SMS BD's accepted `response_code === 202` check and `880...` recipient format used by automatic SMS.

- [x] **Step 1: Add failing source-level route contract tests**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("individual order messaging route", () => {
  const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
  const start = server.indexOf('app.post("/api/orders/:id/send-sms"');
  const end = server.indexOf('app.delete("/api/orders"', start);
  const route = server.slice(start, end);

  it("is authenticated and workspace scoped", () => {
    expect(route).toContain("getUser(getToken(req))");
    expect(route).toContain("getUserOrg(supabase, user.id)");
    expect(route).toContain('.eq("id", req.params.id)');
    expect(route).toContain('.eq("org_id", orgId)');
  });

  it("accepts only a message and sends the stored phone", () => {
    expect(route).toContain("req.body?.message");
    expect(route).toContain("order.phone");
    expect(route).toContain("sendManualBulkSms");
    expect(route).not.toContain("req.body?.phone");
  });
});
```

- [x] **Step 2: Run the contract test and confirm it fails**

Run: `npm test -- src/test/individualOrderMessaging.test.ts`

Expected: FAIL because the route and manual helper do not exist.

- [x] **Step 3: Factor shared gateway submission and add manual sending**

Within `server/index.js`:

1. Add `MAX_MANUAL_SMS_LENGTH = 1000`.
2. Add a shared `submitBulkSmsMessage({ apiKey, senderId, phone, message })` helper that normalizes the phone, converts it to `880...`, URL-encodes credentials/sender/message, calls the Bulk SMS BD endpoint, parses JSON safely, and returns an accepted result only for HTTP success plus response code `202`.
3. Update the existing automatic `sendBulkSms` helper to use the shared submission logic while preserving its current template flags and error-isolation behavior.
4. Add `sendManualBulkSms(orgId, order, message)` that reads `bulksms_enabled`, `bulksms_api_key`, and `bulksms_sender_id`, validates configuration and the saved phone, calls the shared submitter, and throws errors carrying the route status needed by the endpoint. Do not log the API key or full message.
5. Add the authenticated route immediately before the delete-orders route. Validate the message type, trim only for empty-checking while submitting the operator's exact message, enforce the 1,000-code-point limit, load the order with both `id` and `org_id`, call `sendManualBulkSms`, and map errors to the approved status codes.

- [x] **Step 4: Run the route contract test and confirm it passes**

Run: `npm test -- src/test/individualOrderMessaging.test.ts`

Expected: PASS.

- [x] **Step 5: Run existing Bulk SMS regression coverage**

Run: `npm test -- src/test/sendBulkSms.test.ts`

Expected: PASS, including automatic confirmation and dispatch trigger assertions.

- [x] **Step 6: Commit the backend endpoint**

```bash
git add server/index.js src/test/individualOrderMessaging.test.ts
git commit -m "feat: add individual order SMS endpoint"
```

### Task 3: Build the individual SMS composer

**Files:**
- Create: `src/components/order-editor/IndividualSmsDialog.tsx`
- Test: `src/test/individualSmsDialog.test.tsx`

**Interfaces:**
- Consumes `open`, `onOpenChange`, `orderId`, `orderNumber`, `customerName`, `phone`, `price`, and `address` props.
- Calls `apiFetch(`/api/orders/${orderId}/send-sms`, { method: "POST", ... })` with `{ message }`.
- Calls `onOpenChange(false)` only after a successful response.

- [x] **Step 1: Write failing dialog tests**

Cover these behaviors:

```tsx
it("starts empty, inserts resolved order values, and sends the exact message", async () => {
  // Render with a saved order, open the dialog, click the name and order chips,
  // type additional text, click Send SMS, and assert the exact JSON body.
});

it("does not send an empty message and keeps failed text available", async () => {
  // Assert disabled Send SMS for whitespace, then mock a failed response and
  // assert the textarea value remains after the error.
});
```

- [x] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- src/test/individualSmsDialog.test.tsx`

Expected: FAIL because the dialog component does not exist.

- [x] **Step 3: Implement the dialog**

Use the existing `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `Textarea`, and base `Button` components. Keep the message state local and reset it when a new open cycle begins. Use a textarea ref and cursor-aware insertion so quick-insert controls insert resolved values at the current caret without overwriting existing text. Show a Unicode code-point count, disable controls while sending, parse JSON error messages, and use the existing toast helper for success/error feedback.

The quick-insert controls must insert these exact resolved values:

```ts
const quickValues = [
  ["Name", customerName || "Customer"],
  ["Order", orderNumber ? `#${String(orderNumber).replace(/^#+/, "")}` : "order"],
  ["Total", typeof price === "number" ? `৳${price.toLocaleString("en-BD")}` : "the order total"],
  ["Address", address || "the delivery address"],
] as const;
```

- [x] **Step 4: Run the focused test and confirm it passes**

Run: `npm test -- src/test/individualSmsDialog.test.tsx`

Expected: PASS.

- [x] **Step 5: Commit the composer**

```bash
git add src/components/order-editor/IndividualSmsDialog.tsx src/test/individualSmsDialog.test.tsx
git commit -m "feat: add individual SMS composer"
```

### Task 4: Add SMS and WhatsApp actions to the customer panel

**Files:**
- Modify: `src/components/order-editor/CustomerPanel.tsx`
- Test: `src/test/customerPanel.test.tsx`

**Interfaces:**
- Consumes `order.id`, `order.order_number`, `order.price`, the saved `customer` draft, `bdWhatsAppHref`, and `IndividualSmsDialog`.
- Produces accessible `Send SMS` and `Open WhatsApp chat` actions beside the saved phone.

- [x] **Step 1: Extend the failing CustomerPanel tests**

Add assertions that:

```tsx
expect(screen.getByRole("button", { name: /send sms/i })).toBeInTheDocument();
expect(screen.getByRole("link", { name: /open whatsapp chat/i })).toHaveAttribute(
  "href",
  "https://wa.me/8801712345678",
);
```

Also cover invalid phone disabling SMS and omitting/disabling the WhatsApp link, and verify the SMS dialog receives the saved order values.

- [x] **Step 2: Run the focused panel test and confirm the new assertions fail**

Run: `npm test -- src/test/customerPanel.test.tsx`

Expected: FAIL because the actions do not exist.

- [x] **Step 3: Implement the actions without changing edit behavior**

Extend the `CustomerOrder` type with `id` and `order_number`. In the read-only phone row, derive `whatsappHref = bdWhatsAppHref(customer.phone)`. Render the SMS trigger only when the phone is valid and not disabled; render the WhatsApp action as a normal new-tab link with `target="_blank"`, `rel="noreferrer"`, and an accessible label. Keep both actions out of the customer-editing branch. Render `IndividualSmsDialog` at the panel root with `customer.address`, `order.price`, and the saved order identity.

- [x] **Step 4: Run the focused panel test and confirm it passes**

Run: `npm test -- src/test/customerPanel.test.tsx`

Expected: PASS.

- [x] **Step 5: Run the order editor integration test**

Run: `npm test -- src/test/order-detail.test.ts`

Expected: PASS, including existing customer editing, navigation, and save behavior.

- [x] **Step 6: Commit the customer panel actions**

```bash
git add src/components/order-editor/CustomerPanel.tsx src/test/customerPanel.test.tsx
git commit -m "feat: add order SMS and WhatsApp actions"
```

### Task 5: Full verification and review

**Files:**
- Modify: none unless verification exposes an issue

- [x] **Step 1: Run all tests**

Run: `npm test`

Expected: PASS.

- [x] **Step 2: Run lint and production build**

Run: `npm run lint && npm run build`

Expected: both commands exit successfully.

- [x] **Step 3: Review the diff against the target branch**

Run: `git diff --check origin/main...HEAD && git diff --stat origin/main...HEAD`

Expected: no whitespace errors; only the approved design/plan documentation and focused SMS/WhatsApp implementation files are changed.

- [x] **Step 4: Perform a security review of the final diff**

Confirm manually that the final diff contains no secrets, the manual route has auth plus `org_id` filtering, the route never accepts a client phone, and the frontend never receives Bulk SMS credentials.

- [x] **Step 5: Commit any verification-only fixes**

```bash
git diff --name-only
git add server/index.js src/lib/bdPhone.ts src/components/order-editor/IndividualSmsDialog.tsx src/components/order-editor/CustomerPanel.tsx src/test/bdPhone.test.ts src/test/individualOrderMessaging.test.ts src/test/individualSmsDialog.test.tsx src/test/customerPanel.test.tsx
git commit -m "fix: address individual messaging verification findings"
```
