# Plan — Abandoned editor: Save + Move-to-status + Dismiss

## Goal
On `/abandoned/:id` (src/pages/AbandonedDetail.tsx), staff can in ONE click save edits AND move the checkout to an order tab (Pending / On hold / Approved), or dismiss it, then land back on the Abandoned tab. Frontend only — server routes already exist.

## Rulings
- Default selection = "Keep in Abandoned" (safe; nothing moves by accident) — cost if wrong: one extra click.
- No Awaiting contact / Contacted control on this page (out of scope) — cost if wrong: small follow-up.
- No Undo for dismiss (server treats dismiss as final) — cost if wrong: backend follow-up.

## Existing server contracts (do NOT change server)
- `PATCH /api/abandoned-checkouts/:id` with edit body (already used by `save()` in AbandonedDetail) → `{ checkout }`. 404/409 = no longer active.
- `PATCH /api/abandoned-checkouts/:id` body `{ action: "dismissed", activity_group_id? }` ONLY those keys → `{ checkout }`.
- `POST /api/abandoned-checkouts/:id/convert` body `{ status: "pending"|"on_hold"|"approved", customer_name, address, hold_reason_code, hold_reason_detail, hold_until_date }` → `{ order: { order_number } }`. Errors: 404/409 no longer active; 400 with `code: "approval_customer_details_required"` and `error` message; 400 hold validation `error`.
- Reference client implementation: `runAbandonedConvert` / `runAbandonedDismissed` in src/pages/Dashboard.tsx (~lines 912–996). Mirror their request shapes and abandoned-cache removal (`["/api/abandoned-checkouts"]` → filter out id, activeCount - 1).

## Files touched
1. `src/pages/AbandonedDetail.tsx` — main change.
2. `src/components/order-editor/CartPanel.tsx` — add optional `hideActions` prop only.
3. `src/test/abandonedDetail.test.tsx` — new tests (keep existing tests passing).
No other files. Do NOT modify server.

## Implementation (AbandonedDetail.tsx)
1. State: `target: "keep" | "pending" | "on_hold" | "approved"` (default "keep"); `holdDetails: OrderHoldMetadata` (all null); `dismissOpen: boolean`; reuse `saving` as the busy flag for all actions.
2. `isDirty` (useMemo): compare current `customer` (trimmed name/address, digits-only phone), `draft` lines (product_name, variant_name, quantity, unit_price, in order) and effective delivery rate (`deliveryOn ? deliveryRate : 0`) against `checkout` (customer_name/phone/address, cart, Number(delivery_rate)||0).
3. Refactor current `save()` into `persistEdits(): Promise<boolean>` (all existing validation + PATCH + cache update; returns false on validation/HTTP failure; keep 404/409 → toast + goBack). Keep behaviour identical when used alone.
4. New `submit()`:
   - target "keep": `await persistEdits()` (existing behaviour: stay on page, toast "Checkout updated").
   - otherwise:
     a. Client checks before any request: on_hold → `validateOrderHoldDetails({ reasonCode, reasonDetail, holdUntilDate })` from `../../shared/orderHold.js` (same import path style as src/pages/OrderDetail.tsx) — on error set saveError and stop. approved → name and address non-empty after trim, else saveError "Add the customer name and address before approving".
     b. If `isDirty`: `persistEdits()`; stop if false (but do NOT toast "Checkout updated" in this path — pass a flag or split toast out).
     c. POST convert with status, trimmed customer_name/address, hold fields (null when not on_hold), plus the same shape as Dashboard.
     d. Failure: 404/409 → toast.error("Checkout is no longer active") + goBack. Else set saveError to server `error` (fallback "Could not move checkout"); if edits were saved in step b, message must say edits were saved: e.g. `${error} Your edits were saved.` Stay on page.
     e. Success: remove id from `["/api/abandoned-checkouts"]` cache (same as Dashboard), `toast.success(`Order #${order_number} moved to ${Label}`)` with Label Pending / On Hold / Approved, then `goBack()` (navigates to "/" with `{ fulfillmentTab: "abandoned" }`). Dashboard refetches orders on mount — no extra invalidation needed.
5. `dismiss()`: PATCH `{ action: "dismissed", activity_group_id: createActivityGroupId() }`; on success remove from cache, toast.success("Checkout dismissed"), goBack(). 404/409 → toast.error("Checkout is no longer active") + goBack. Other failure → toast.error("Could not dismiss checkout"), stay.
6. UI — add ONE optional prop to CartPanel: `hideActions?: boolean` (default false). When true, CartPanel skips rendering its Save + Cancel buttons (the status select is already hidden by hideOrderSections). Zero behaviour change for other callers. AbandonedDetail passes `hideActions`. Then render a new action bar in AbandonedDetail directly below the CustomerPanel/workspace grid, inside the `details` panel (panel style `bg-[#FAFAF8] px-5 py-4`).
   Action bar contents (data-testid="abandoned-action-bar"):
   - Label "Move to" (8px uppercase tracking-[0.3em] label style) + segmented control: 4 `<button type="button" aria-pressed>` options: "Keep in Abandoned", "Pending", "On hold", "Approved". Selected = `bg-black text-white`, others `bg-black/[0.04] text-black`; `rounded-lg h-9 px-3 text-[12px]`; wrap on mobile (flex-wrap gap-1.5). role="group" aria-label="Move checkout to".
   - When target === "on_hold": render `<OrderHoldFields value={holdDetails} onChange={setHoldDetails} disabled={saving} />` (it uses col-span-3; wrap in a plain div).
   - `saveError` shown as `<p role="alert" className="text-[12px] text-red-600">` in the bar (CartPanel's error prop can keep receiving saveError too — fine, but avoid double rendering: pass `error={undefined}` to CartPanel now that the bar shows it).
   - Row: left `Dismiss` button (plain text, `text-[12px] text-red-600 hover:underline`, disabled when saving) → opens AlertDialog; right: `Cancel` (BuiButton ghost, goBack) + primary black button (same classes as CartPanel's Save) with label: keep → "Save changes"; else "Save & move to Pending" / "Save & move to On hold" / "Save & move to Approved". While saving show Spinner + "Saving…".
   - Keyboard: Cmd/Ctrl+Enter anywhere on page triggers submit (useEffect keydown listener, ignore when saving or when dismiss dialog open).
   - Dismiss AlertDialog (import from "@/components/ui/alert-dialog", same as AbandonedCheckoutQueue): title "Dismiss checkout?", description "Dismiss this checkout from the recovery queue? This cannot be undone." plus, if isDirty, " Your unsaved changes will be lost." Cancel "Keep checkout", action "Dismiss checkout" (aria-label "Confirm dismiss", `bg-red-600 text-white hover:bg-red-700`).
7. Remove CartPanel's `onCancel`/`onSave` wiring as appropriate but still pass required props (no-ops acceptable when hideActions).

## Tests (src/test/abandonedDetail.test.tsx) — write first, watch fail, then implement
Use the existing mock pattern (apiFetch mocked by url/method).
- Default: "Keep in Abandoned" pressed; primary button text "Save changes"; clicking it (after editing name) sends PATCH and stays on page (no dashboard-home).
- Select Approved → button reads "Save & move to Approved"; with no edits, click → NO PATCH, POST `/api/abandoned-checkouts/draft-1/convert` with body.status "approved", then navigates to dashboard-home.
- With an edit + Pending → PATCH then POST (order asserted), then dashboard-home.
- On hold without reason → no request sent, alert "Choose a hold reason".
- Convert failure (400 `{ error: "Boom" }`) after an edit → stays on page and alert contains "Your edits were saved".
- Dismiss → dialog → Confirm → PATCH body `{ action: "dismissed", ... }` → dashboard-home. Dialog shows "unsaved changes will be lost" when edited.
- Existing test "no order-status select" must still pass.

## Verify
- `npx vitest run src/test/abandonedDetail.test.tsx` all green.
- `npx vitest run` (full) — no new failures vs baseline (record baseline failures first).
- `npm run lint` — no new errors in touched files.
- `npx tsc --noEmit -p tsconfig.app.json` (or the project's tsconfig) — no new errors in touched files.
