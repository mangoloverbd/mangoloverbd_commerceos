# SDD ledger — plan: docs/superpowers/plans/2026-09-28-business-report-redesign.md
Task 1: dispatched (base c3b3379)
Task 1: minor (deferred): hourly_profile test asserts only key/label/count/value on 3 buckets
Task 1: minor (deferred): all-time series truncated to 30 days while hourly_profile sums all rows
Task 1: minor (deferred): float sums unrounded (display must round)
Task 1: complete (commits c3b3379..6735948, review clean)
Note: implementer agent cannot run git writes; controller commits after each implementer report.
Task 2: minor (deferred): no boundary-instant tests at request.since / previous.since
Task 2: minor (deferred): previous-period orders not asserted absent from series/sources/products
Task 2: minor (deferred): wiring test lacks toContain('gte("created_at", windowStart)')
Task 2: minor (deferred): previous window fetches full projection incl. order_items (~2x egress; plan-mandated) — raise with user
Task 2: minor (deferred): previous.range shares object with previousRequest.range
Task 2: complete (commits 6735948..c7e6bf7, review clean)
Note: tsc baseline on main = 75 errors (pre-existing, incl. apiFetch mock typing in businessReportPage.test.tsx); branch at 40a5d03 = 75.
Task 3: minor (deferred): buildSourceRows approval flag lacks zero-intake guard (unreachable via current API)
Task 3: minor (deferred): no minimum sample size before flagging small sources (plan-mandated)
Task 3: minor (deferred): netPerOrder divides by intake_count incl. pending/cancelled (plan-mandated; label clearly)
Task 3: minor (deferred): groupSourceMix folds a single leftover source into "Other"
Task 3: minor (deferred): test gaps — label desc sort, ties, zero-value drop, maxIndex ties
Task 3: complete (commits c7e6bf7..40a5d03, review clean)
Task 4: review Needs fixes — 2 Important (plan-mandated code): grid rows pixel-dependent; tooltip XSS via product_name. Ruling: fix both — plan intent (14 rows, safe HTML) governs literal code — cost if wrong: trivial revert.
Task 4: minor (deferred): ring labels not centred; rings 4/5 same grey; best-day spacer on zero-website days, no clamp, %7 label interval; EChart hardcoded font vs CHART.font; option identity must be memoized by callers; sankey rich-text breaks on {|}; gauge/rings/sparkline untested; jsdom echarts init noise
Task 4: fix round 1/5 (2 addressed, 0 open — grid symbolRepeat=GRID_ROWS; escapeHtml in tooltips; commits d8e5ae3..8b06b78)
Task 4: complete (commits 40a5d03..8b06b78, review clean after 1 fix round)
Task 5: review Needs fixes — 1 Important (plan-mandated): pts delta vs fabricated 0% baseline when prev intake 0. Ruling: fix — intent governs — cost if wrong: trivial.
Task 5: minor (deferred): tsc 75→77 from apiFetch mock typing in page test — fix whole file with vi.mocked(apiFetch) in Task 6/7
Task 5: minor (deferred): "omits" test weak; no tone/sparkline assertions
Task 5: minor (deferred): pts deltas lack "vs previous period" suffix; good/bad by colour only; sparkline aria-label uninformative
Task 5: minor (deferred): formatters duplicated across SummaryTiles/page; unused ProductWeight import in test
Task 5: fix round 1/5 (1 addressed, 0 open — zero-intake pts guard; commits 193f42c..1f11278)
Task 5: complete (commits 8b06b78..1f11278, review clean after 1 fix round)
Task 6: note — ProductWeightRow/ProductWeightList kept (SourceCard still uses them); Task 7 must delete them
Task 6: review Needs fixes — 1 Important (plan gap): Best day misleading for All time (series = last 30 active days). Ruling: hide for unbounded range — consistent with no-deltas ruling — cost if wrong: re-enable as "Best recent day".
Task 6: minor (deferred): "1 products" plural in ProductWeightPanel aside
Task 6: minor (deferred): sankey badge counts zero sources and hardcodes "4 outcomes"
Task 6: minor (deferred): "Delivered or moving" = approved share only — copy mismatch (plan-mandated)
Task 6: minor (deferred): duplicate eyebrow/heading text (Best day, Product weight); mono glyph labels not aria-hidden
Task 6: minor (deferred): Best day label lacks year for multi-year bounded ranges
Task 6: minor (deferred): tests don't cover empty products / all-zero buckets; two untyped expect(apiFetch) remain
Task 6: fix round 1/5 (1 addressed, 0 open — hide Best day for All time; commits 9923ed6..c2c9f48)
Task 6: complete (commits 1f11278..c2c9f48, review clean after 1 fix round)
Task 7: review Needs fixes — 1 Important (plan-mandated): Loss shows 0% for kg=0 products. Ruling: render "—" — cost if wrong: trivial.
Task 7: minor (deferred): caption "5+ pts" vs strict > threshold
Task 7: minor (deferred): product rows keyed by name (duplicate names / "All products" collision)
Task 7: minor (deferred): source rows lack row header; sort glyphs in accessible names; aria-controls to unrendered row; caret transition ignores reduced motion
Task 7: minor (deferred): per-source fee/weight coverage and landing-page kg dropped; fee coverage shown twice on page
Task 7: minor (deferred): signedTaka shows −৳0 / +৳0; "1 orders" plural on landing pages
Task 7: minor (deferred): tests lack aria-sort/reverse-sort, no-landing-pages panel, +৳ sign, empty products state
Task 7: minor (deferred): third copy of en-BD formatters
Task 7: fix round 1/5 (1 addressed, 0 open — no-kg loss shows dash; commits b5d1f09..57b8862)
Task 7: complete (commits c2c9f48..57b8862, review clean after 1 fix round)
Task 8: checks on 57b8862 — npm test 242 files/1592 passed; tsc 65 (main 75); eslint exit 0; build OK; echarts only in lazy BusinessReport chunk (658KB/223KB gz)
Task 8: visual QA (harness, sample data) — no horizontal overflow at 390px. Findings: (a) gauge shows 79.5% twice (ECharts detail + panel text); (b) ProductWeightPanel names truncated to "H."/"Lan…" at 390px; (c) product ring labels clipped at right edge / rings small
Task 8: note — currency renders ৳1,248,300 (en-BD = western grouping in Chrome); pre-existing app convention, not changed
Final review: With fixes — Important: partial-today vs full previous; previous query full projection (~2x egress); Task 8 QA. Fix wave dispatched (findings in final-fix-findings.md, base 57b8862)
Final fix wave: 13/13 addressed (commits 57b8862..002439c). Parked minors: C2 mobile grid leaves empty 5th track (~10px); C3 ring-name row read twice by screen readers (aria-hidden).
Final verification on 002439c: 242 files/1597 tests passed; tsc 65 (main 75); eslint 0; build 0.
