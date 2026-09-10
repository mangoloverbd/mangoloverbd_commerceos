# Pending Order SMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send confirmation SMS immediately when pending dashboard, storefront, or Social Inbox orders are created.

**Architecture:** Reuse the existing org-scoped `sendBulkSms` helper. Add the missing call after successful dashboard order persistence, keep the awaited storefront call, and adapt newly inserted Social Inbox orders to the helper's order shape. Remove the status-transition confirmation call to prevent duplicate messages after the executive confirms by phone.

**Tech Stack:** Node.js 20, Express, Supabase, Vitest.

## Global Constraints

- Confirmation SMS is sent on successful pending order creation.
- Coverage includes dashboard, storefront webhook, and Social Inbox creation paths.
- Approved/Confirmed status changes do not send another confirmation SMS.
- SMS errors must not roll back saved orders.
- Preserve org-scoped queries and existing BulkSMSBD `880...` formatting and `202` success handling.

---

## Task 1: Add failing regression tests

**Files:**
- Modify: `src/test/sendBulkSms.test.ts`

- [x] Assert `POST /api/orders` awaits the confirmation helper after order/item persistence.
- [x] Assert the storefront webhook awaits confirmation on creation.
- [x] Assert `saveMetaInboxOrder` sends confirmation for the inserted pending Social Inbox order using its stored phone.
- [x] Assert `PATCH /api/orders/:id` does not send confirmation on an Approved/Confirmed transition.
- [x] Run `npm test -- src/test/sendBulkSms.test.ts` and confirm the new assertions fail against the current source.

## Task 2: Implement pending-order confirmation

**Files:**
- Modify: `server/index.js`

- [x] Await `sendBulkSms(orgId, "confirmation", data)` in `POST /api/orders` after item persistence succeeds.
- [x] Preserve the already-awaited storefront webhook call.
- [x] Normalize the Social Inbox phone before insertion, then await confirmation after `saveMetaInboxOrder` inserts a new order; skip duplicates.
- [x] Remove `shouldSendConfirmationSms` and the confirmation call from `PATCH /api/orders/:id`.
- [x] Run the focused regression test and confirm it passes.

## Task 3: Verify

- [x] Run the full Vitest suite with the repository's stable hook timeout if needed.
- [x] Run `npm run lint` and `npm run build`.
- [x] Run `git diff --check` and review the final diff for org guards and secret exposure.
