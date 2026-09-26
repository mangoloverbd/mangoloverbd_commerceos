# Lock Order Source After Creation Implementation Plan

> **For agentic workers:** Execute this plan inline, test-first, in the current workspace.

**Goal:** Let staff choose an order source during creation, then prevent changing it after the order is saved.

**Architecture:** Keep the source visible as a read-only value in the Order Editor and remove it from the editor's save payload. Enforce immutability in `PATCH /api/orders/:id` as well, while keeping all other editable order fields unchanged.

**Tech Stack:** React 18, TypeScript, Express, Vitest.

## Global Constraints

- Preserve authenticated API usage through `apiFetch()` on the frontend.
- Preserve resolved Mango Lover BD `org_id` filters on server order reads and writes.
- Do not add a database migration or change order creation source selection.

---

### Task 1: Cover locked source behavior

**Files:**
- Test: `src/test/order-detail.test.ts`
- Test: `src/test/orderSourceRouteWiring.test.ts`
- Test: new focused route test if existing source-wiring assertions cannot verify rejection behavior.

- [x] Assert the Order Editor shows the saved source but does not allow changing it or saving a source patch.
- [x] Assert the authenticated order PATCH rejects a changed `source` with a clear conflict response, while ordinary order edits remain permitted.
- [x] Run the focused tests and confirm the new expectations fail against current behavior.

### Task 2: Lock the source after creation

**Files:**
- Modify: `src/pages/OrderDetail.tsx`
- Modify: `src/components/order-editor/CustomerPanel.tsx` if needed to display a read-only source.
- Modify: `server/index.js`
- Modify: `docs/superpowers/specs/2026-09-14-order-source-design.md`

- [x] Render the current source as read-only in the Order Editor and remove source draft/change handling from its save flow.
- [x] In the authenticated PATCH route, compare any requested source with the stored source after the existing org-scoped order lookup; reject actual changes without blocking unrelated edits.
- [x] Update the order-source design doc to state that source is editable only before initial order creation.
- [x] Run focused tests, then `npm test`, `npm run lint`, and `npm run build`.

Verification: 49 focused tests pass; full suite passes (226 files, 1,484 tests); lint exits successfully with existing warnings; production build completes with existing warnings.
