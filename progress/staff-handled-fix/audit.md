# Audit: staff-handled-fix

## Files changed
- server/reports.js
- server/index.js
- src/lib/staffPerformancePresentation.ts
- src/lib/staffPerformanceMetrics.ts
- src/lib/staffPerformanceCharts.ts
- src/components/staff-performance/StaffCharts.tsx
- src/components/staff-performance/StaffTable.tsx
- src/pages/StaffPerformance.tsx
- src/test/staffReport.test.ts
- src/test/staffReportRouteWiring.test.ts
- src/test/staffPerformancePresentation.test.ts
- src/test/staffPerformanceMetrics.test.ts
- src/test/staffPerformanceCharts.test.ts
- src/test/staffPerformancePage.test.tsx

The full per-file detail, the deviations, the RED/GREEN evidence and the risks are in
.superpowers/sdd/staff-handled-fix/report.md.

## Results
- npm test: 244 files / 1627 tests passed. The only stderr comes from pre-existing, unrelated warnings.
- tsc (tsconfig.app.json): 64 errors (the baseline was 65), none in touched files.
- eslint on the touched files: clean.
- npm run build: succeeded.

## Open risks
- Duplicate confirm activities for one order can push the confirmation rate above 100%. The formula is per the brief.
- Loss double-counts the kg of orders the same member confirmed and then cancelled. The formula is per the brief.
- There are more order_items reads, because cancelled orders are now included.
- A `git stash` / `git stash pop` was run once to measure the tsc baseline. The tree was restored intact.

## Fix round 1 (controller ruling: last action per member and order)

Files changed are the same as the list above. No new files.

### Changes
- server/reports.js
  - `emptyMetrics` removes `confirmed_then_cancelled_count` and adds:
    - handled_count
    - handled_confirmed_count, handled_confirmed_value, handled_confirmed_kg
    - handled_cancelled_count, handled_cancelled_value
    - handled_delivered_count, handled_delivered_value
    - handled_returned_count, handled_returned_value
  - `recordHandled` keeps, for each actor, a map from order to its latest action `{ action, at, order, orderId }`. It is called from both regular loops after the existing guards. A later or equal timestamp replaces the stored entry, so on a tie the activity processed later wins. An activity with no order id gets a unique `unknown:N` key and is never merged.
  - After both loops, a single pass over the latest-action entries sets the handled_* fields and builds the regular product maps:
    - last action confirmed: the order's items go into the confirmed map, and into the delivered or returned map according to `classifyCourierOutcome`;
    - last action cancelled: the items go into the cancelled map.
  - Regular-order products are no longer accumulated once per activity. The activity counters (confirmed_count, cancelled_count, delivered_count, returned_count and their values, telesales, series) and the assigned counters are unchanged.
- src/lib/staffPerformancePresentation.ts: the types swap `confirmed_then_cancelled_count` for the handled_* fields. The snapshot's confirmation rate is Σhandled_confirmed ÷ Σhandled. The delivered rate is Σhandled_delivered ÷ Σhandled_confirmed.
- src/lib/staffPerformanceMetrics.ts
  - Segments come only from handled_*:
    - inTransit = max(0, handled_confirmed − handled_delivered − handled_returned);
    - cancelled = handled_cancelled.
  - Row `confirmed` = handled_confirmed.
  - Rates: confRate = handled_confirmed ÷ handled; cancelRate = handled_cancelled ÷ handled; delRate = handled_delivered ÷ handled_confirmed. Team averages use the same basis.
  - Funnel confirmed = Σhandled_confirmed.
  - The `confirmedNotCancelled` helper is removed.
- src/components/staff-performance/StaffTable.tsx
  - The detail bar "Confirmed, not cancelled" = handled_confirmed, shown with ৳ handled_confirmed_value.
  - Delivered, RTO and Cancelled show ৳ handled_delivered_value, handled_returned_value and handled_cancelled_value.
  - Footer: "Conf. rate = confirmed ÷ handled · Delivered = delivered ÷ confirmed · Handled = orders confirmed or cancelled (each order counted once, by the member's last action)".
  - The Loss formula is unchanged.

### Tests
- src/test/staffReport.test.ts
  - Adapted A/B/C test: handled 3, handled_confirmed 1 (৳1000, 2 kg), handled_cancelled 2 (৳800), handled_delivered 1. The activity counters are still confirmed 2 and cancelled 2, and `confirmed_then_cancelled_count` is gone.
  - New reviewer scenario: B goes confirm → cancel → reconfirm (delivered), and D is cancelled twice. Expected: handled 2, handled_confirmed 1, handled_cancelled 1, handled_delivered 1, activity counters confirmed 2 and cancelled 3. The products are counted once: Mango packs 2 and delivered 2; Honey cancelled 1.
  - The unknown-id test now expects handled 2, handled_confirmed 1 and handled_cancelled 1.
- src/test/staffPerformanceMetrics.test.ts
  - The fixtures use handled_*, with inflated activity counters as decoys.
  - New test "keeps the outcome segments summing to handled even when activity counters repeat" covers the reviewer's case plus 4 other rows. For each row, the sum of segments equals handled.
- src/test/staffPerformancePresentation.test.ts and the page snapshot test use handled_* fixtures and expect 60% / 50%.
- src/test/staffPerformancePage.test.tsx
  - The card test uses handled_* values, with decoy activity values.
  - The 340 test uses handled_confirmed 328 and handled_cancelled 12. It expects Confirmed 328, Conf. rate 96.5% and Cancel rate 3.5%, plus the footer text and the card's Cancelled 12.
- RED: `npx vitest run src/test/staffReport.test.ts` → `Tests 3 failed | 55 passed (58)`.
- RED: `npx vitest run src/test/staffPerformancePresentation.test.ts src/test/staffPerformanceMetrics.test.ts src/test/staffPerformancePage.test.tsx src/test/staffPerformanceCharts.test.ts` → `Tests 7 failed | 30 passed (37)`.
- GREEN: `npx vitest run src/test/staffReport.test.ts` → `Tests 58 passed (58)`.
- GREEN: `npx vitest run src/test/staff` → `Tests 122 passed (122)`.

### Verification
- `npm test` → `Test Files 244 passed (244)`, `Tests 1628 passed (1628)`. The stderr noise is the same as before and comes from unrelated tests, plus existing React Router flag warnings.
- `npx tsc --noEmit -p tsconfig.app.json | grep -c "error TS"` → `64`, none in staff files.
- `npx eslint <14 touched files>` → `eslint exit 0`.
- `npm run build` → `✓ built in 7.58s`.
- No git commands were run in this round.

### Remaining notes
- The Confirmed value column, AOV, Weight and the leaderboard still use the activity-based confirmed_value, confirmed_count and confirmed_kg. The table's Confirmed count column now uses handled_confirmed. The leaderboard's "{n} orders" label reads that same handled_confirmed count, beside an activity-based value. These can differ when orders are re-confirmed.
- `missing_weight_products` now comes from the latest-action entries, so it still includes products from cancelled orders.

## Fix round 2

Files touched this round: server/reports.js, src/lib/staffPerformanceMetrics.ts, src/test/staffReport.test.ts, src/test/staffPerformanceMetrics.test.ts and src/test/staffPerformancePage.test.tsx. All of them were already in the Files changed list.

### Changes
- src/lib/staffPerformanceMetrics.ts, `buildStaffTableRows`: `value` is now `handled_confirmed_value`, `kg` is now `handled_confirmed_kg`, and `aov` is `handled_confirmed_value / handled_confirmed_count` (null when that count is 0). The table row and the leaderboard therefore use one basis: value ÷ orders = AOV. The snapshot tiles and `groupStaffShare` are unchanged, as instructed.
- server/reports.js, `recordHandled`: an entry is replaced when the new action is strictly later, or when it has the same timestamp and is a cancel. A confirm and a cancel by the same member at the same instant are therefore classified as cancelled.

### Tests
- src/test/staffReport.test.ts, new test "classifies an order as cancelled when the member's confirm and cancel share a timestamp": confirmed_at === cancelled_at gives handled 1, handled_cancelled 1, handled_confirmed 0.
- src/test/staffPerformanceMetrics.test.ts:
  - New test "takes value, weight and AOV from the handled confirmed orders so value / orders = AOV". It uses the brief's A/B/C shape: activity confirmed_value 1500, confirmed_count 2, kg 5; handled_confirmed 1 with ৳1000 and 2 kg. Expected: confirmed 1, value 1000, kg 2, aov 1000. It also checks that aov is null when handled_confirmed is 0.
  - In the main fixture, Sadia's handled value is ৳88,000 and 200 kg, while her activity value is ৳95,000 and 220 kg. The test expects value 88000, kg 200, aov 1000.
- src/test/staffPerformancePage.test.tsx: the three ranking fixtures set `confirmed_value` to 1800 or 900. They now set the same `handled_confirmed_value`, so the table's value ranking is exercised deliberately instead of passing on a tie.
- RED: `npx vitest run src/test/staffReport.test.ts src/test/staffPerformanceMetrics.test.ts` → `Tests 3 failed | 65 passed (68)`. The failures were the tie test, the new AOV test and the updated main-fixture test.
- GREEN: `npx vitest run src/test/staff` → `Tests 124 passed (124)`.

### Verification
- `npm test` → `Test Files 244 passed (244)`, `Tests 1630 passed (1630)`.
- `npx tsc --noEmit -p tsconfig.app.json | grep -c "error TS"` → `64`, none in staff or report files.
- `npx eslint server/reports.js src/lib/staffPerformanceMetrics.ts src/test/staffReport.test.ts src/test/staffPerformanceMetrics.test.ts src/test/staffPerformancePage.test.tsx` → `eslint exit 0`.
- `npm run build` → `✓ built in 7.17s`.
- No git commands were run.

### Remaining note
- The page may still order rows with `sortStaffPerformanceRows`, which uses the activity-based confirmed_value, before the table re-sorts them by handled value. The visible table order and rank badges come from the table's own sort, so this only affects tie order. The snapshot tiles and team contribution stay activity-based until the planned follow-up.
