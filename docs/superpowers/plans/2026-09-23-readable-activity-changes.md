# Readable Activity Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make status changes and order-item edits understandable at a glance in the full-page Logs view, keeping the colorful chip styling.

**Architecture:** Pure presentation helpers in `src/lib/orderActivityPresentation.ts` classify and format recorded changes (status labels and colors, item change kinds, taka values, cleaned variant labels). A new `OrderActivityChangeDetails` component renders them. `OrderActivityTimeline` uses it only in the `full` variant; the compact popover rendering is unchanged. No server changes: `server/orderActivity.js` already records `type`, `quantity_delta`, `amount_delta`, and `addition_reason`.

**Approved design:**
- Status: heading "Status changed" plus `[● Pending] → [● Approved]` chips using app status labels and colors.
- Items: summary line ("1 added · 1 removed · Total ৳700 → ৳400" plus a signed delta chip), then one row per item with an action chip (`+ Added` lime, `− Removed` rose, `↑/↓ Qty a → b` yellow, `Discount ৳a → ৳b` purple), cleaned label, quantity, reason chip, and signed taka impact.
- Other fields: compact `Label  before → after`, with `৳` for money fields and "Not set" for empty values.
- Variant JSON such as `{"size":"১ কেজি"}` renders as `১ কেজি`.
- Follow-up review: each Logs row uses equal side columns so the change summary sits in the centered middle column; item rows list beneath it; the exact time stays under the heading and the relative time sits on the right.

### Task 1: Presentation helpers

**Files:** Create `src/lib/orderActivityPresentation.ts`; test `src/test/orderActivityPresentation.test.ts`.

- [x] Write failing tests for status labels/colors, item change classification (typed and legacy), label cleaning, grouping, summary text, signed taka, and field value formatting.
- [x] Run and confirm failures; implement; re-run to green.

### Task 2: Change details rendering

**Files:** Create `src/components/OrderActivityChangeDetails.tsx`; modify `src/components/OrderActivityTimeline.tsx`; test `src/test/orderActivityTimeline.test.tsx`.

- [x] Write failing render tests for a status event and an item-edit event in the full variant; confirm compact rendering is unchanged.
- [x] Implement; re-run to green.

### Task 3: Verification

- [x] Full Vitest suite, `npm run build`, lint on changed files, `git diff --check`.
