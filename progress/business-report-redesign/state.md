# Business Report redesign — state (2026-09-28)

## Status
Design approved by user. Not yet implemented. Next phase: implementation plan.

## Approved mockup
- Artifact: https://claude.ai/artifact/TYoMtX6VBSir3w58JzwYkv (v6)
- Local copy: progress/business-report-redesign/mockup.html (sample figures only)

## Approved layout (top → bottom) for src/pages/BusinessReport.tsx
1. Summary numbers (existing 5) + sparklines and "vs prev period" deltas — needs previous-period data (backend)
2. Intake rhythm — evilcharts grid-echarts-bar-chart — series.buckets (exists)
3. Order outcomes sankey (source → approved/pending/cancelled/returned) — pipeline-echarts-sankey-chart — sources[] (exists)
4. Source mix donut, monochrome — market-share-echarts-pie-chart — sources[].order_value (exists)
5. Approval rate gauge — reliability-score-echarts-pie-chart — summary (exists)
6. Delivery economics — unchanged numbers
7. Best day / daily bars split website vs social&manual — peak-echarts-bar-chart — NEEDS per-source value per bucket (backend)
8. Product weight rings + ranked list — budget-echarts-radial-chart — products[] (exists)
9. Source performance: sortable table (orders, value, share, outcome-mix bar, approval %, loss %, AOV, kg, net delivery/order; red flag when >3 pts worse than average). Row expands to: delivery economics card + landing pages card (website) or outcome counts card, then a Products-by-outcome table (ordered kg, split bar, approved/pending/cancelled/RTO kg + %, loss %, All products total row; red when loss 5+ pts above that source). "Expand all" button. Uses sources[].products *_kg (exists). Replaces SourceCard.

## Rejected
- Shipments-style this-vs-previous line (user disliked)
- Audience Growth running-total area (replaced by Peak Week at user's choice)
- "Weight by outcome" card in source detail (duplicated product table total row)

## Implementation notes
- evilcharts blocks use ECharts; project uses Recharts. Add `echarts` only on the lazy-loaded report page.
- Restyle blocks to monochrome + semantic colors; ৳ with en-IN grouping.
- Backend additions: per-source value per series bucket; previous-period summary/buckets (only for sparklines/deltas).

## Plan (2026-09-28)
- Written: docs/superpowers/plans/2026-09-28-business-report-redesign.md (8 tasks, TDD)
- Awaiting human review of the plan before implementation.

## Implementation (2026-09-28)
- Branch feat/business-report-redesign, 13 commits c3b3379..002439c, all 8 plan tasks done via subagent-driven development with per-task review + final whole-branch review.
- Verified on 002439c: 1597/1597 tests, tsc 65 (main 75), eslint clean, build OK, ECharts only in lazy BusinessReport chunk.
- Rulings beyond plan: grid fixed 14 rows; tooltip HTML escaped; pts deltas hidden when previous intake 0; Best day hidden for All time; Loss "—" for no-kg products; "Today" compared with same elapsed time yesterday; previous-period query uses lean fields.
- Follow-ups (not blocking): staleTime done; shared en-BD formatters; min sample size before red flags; per-source fee/weight coverage lost from old cards; mobile product grid 5th track; ring-name aria-hidden; currency shows western grouping (৳1,248,300) — pre-existing app convention.
- Full ledger: progress/business-report-redesign/sdd-ledger.md
- Next: finish branch (PR via ship skill, or merge).

## Shipped (2026-09-28)
- PR #131 merged to main (merge commit 6a173ae), VERSION 0.1.0.37 + CHANGELOG. Includes panel-balance and row-click/animated-expand follow-ups.
- Remaining follow-ups: see "Follow-ups" above.
