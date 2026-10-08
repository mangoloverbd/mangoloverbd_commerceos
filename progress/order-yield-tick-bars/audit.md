# Audit: Order yield tick-mark bars

## Files changed
- src/components/staff-performance/StaffCharts.tsx
- src/lib/staffPerformanceCharts.ts
- src/test/staffPerformancePage.test.tsx
- src/test/staffPerformanceCharts.test.ts
- progress/order-yield-tick-bars/audit.md (this file)

## src/components/staff-performance/StaffCharts.tsx (final state after round 3)
- `OrderYieldPanel`: the ECharts chart is replaced by a `ul` ("Order yield by staff") of CSS tick-mark bar rows (`data-testid="staff-yield-row-<user_id>"`). Rows come from `buildStaffTableRows`, skip `deliveredShare === null`, and are sorted by delivered share, highest first.
- Row grid is `grid-cols-[92px_minmax(0,1fr)_52px] gap-3`: name plus "N handled", then the bar, then the delivered % (16px font-medium tabular-nums). The bar is `role="img"`, `relative flex h-[18px]` with no gap, and its aria-label and title are the same text.
- Flag rule mirrors `flagFor` (which is not exported): `deliveredShare < teamShare - STAFF_FLAG_POINTS` gives `text-[#B4473A]`.
- Segments (`data-segment=<key>`) have `shrink-0 bg-no-repeat` and a width of exactly `share%`, with no borders. Zero-share segments are not rendered. The tick pattern is `repeating-linear-gradient(90deg, COLOR 0 3px, transparent 3px 5px)`.
- Gap between segments: every segment after the first gets `backgroundSize: max(2px, calc(100% - 4px)) 100%` and `backgroundPosition: right`, so its left 4px stays blank. The gap is painted inside the segment and does not change layout. Delivered starts at 0 and paints its full width.
- Team tick (`data-testid="staff-yield-team-tick"`): an absolute dashed `border-l-[1.5px]` line at `opacity-[0.55]` and `left: teamShare%`, running `-top-1 -bottom-1`. It uses the same scale as the segments. Below the list is an aria-hidden label row "Team X%" in the same grid columns.
- Imports: dropped `yieldChartHeight` and `yieldOption`; added `STAFF_FLAG_POINTS`, `StaffTableRow` and `YieldKey`. `reduceMotion` is no longer destructured in this panel.
- Pill, empty state, legend and both footnotes are unchanged.

## src/lib/staffPerformanceCharts.ts
- Removed `YIELD_ROW_HEIGHT`, `yieldChartHeight` and `yieldOption`. `tooltip`, `taka`, `count` and `escapeHtml` stay because `leaderboardOption` still uses them.

## src/test/staffPerformancePage.test.tsx
There are three new tests:
- Round 1: descending sort, the zero-handled member being absent, the red flag, exact aria-label and title, the team label and both footnotes.
- Round 2: the team is exactly 70%. It checks segment widths are the exact %, every tick's left is 70%, zero-share segments are absent, exactly 5 points below is not flagged, and 6 below is flagged.
- Round 3: tiny outcomes (1 of 50 = 2%, 1 of 200 = 0.5%) keep their exact widths, and no segment has a border class.

## src/test/staffPerformanceCharts.test.ts
- Removed the `yieldOption` describe block and the `yieldChartHeight` test, and fixed the imports.
- Removed the unused `markLine` field from `Series`.
- Renamed `describe("layout helpers")` to `describe("leaderboardOption value label")`.

## Deviations
- `STAFF_FLAG_POINTS` was already exported, so staffPerformanceMetrics.ts was not touched.
- Opacity is `opacity-[0.55]` (arbitrary value) rather than `opacity-55`, in case that step is missing from the Tailwind scale.
- `flagFor` is not exported, so its comparison is copied inline with a comment, rather than exporting it (that file was allowed for export only).

## History
- Round 1 used `gap-1` with shrinking segments. The reviewer flagged the scale mismatch.
- Round 2 used `border-r-4` with `bg-clip-padding`. The reviewer flagged that it inflates and hides tiny segments.
- Round 3 uses no borders and no gap in layout; the gap is painted in the background.

## Results
- Round 1: the new test failed first (1 failed | 23 passed), then passed.
- Round 2: I wrote the test after the fix, so I never saw it fail first.
- Round 3: the new test failed first on the old code (`expected 'box-border h-full shrink-0 bg-clip-pa…' not to match /\bborder/`, 1 failed | 25 passed), then passed. The two test files now have 30 passed (30).
- Final npm test: Test Files 246 passed (246), Tests 1656 passed (1656).
- Final npm run lint: 0 errors, 170 warnings (these were already there; eslint on the 4 touched files prints nothing).
- Final npm run build: built in 8.09s (only the existing chunk-size warning).
- `npx tsc --noEmit -p tsconfig.app.json | grep -i staff`: empty.

## Open risks
- No visual QA in a browser yet. jsdom cannot check the look of the background-size gap.
- A segment rendered narrower than 2px paints only its own width, because the background is clipped to the element.
- The panel no longer has a minimum height of 220px. Its height now follows the number of rows.
