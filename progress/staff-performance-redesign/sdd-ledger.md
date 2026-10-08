# SDD ledger — plan: docs/superpowers/plans/2026-09-28-staff-performance-redesign.md
tsc baseline: 65
Task 1: minor (deferred): long bounded ranges emit one bucket per day with no cap (plan-mandated; payload)
Task 1: minor (deferred): range must be passed separately; fallback from from/to would remove trap
Task 1: minor (deferred): tests lack Dhaka day-boundary, dedupe-once, zero-staff series cases
Task 1: minor (deferred): hour keys not zero-padded
Task 1: complete (commits 15cbe3a..8806483, review clean)
Note: implementer cannot run git writes; controller commits.
Task 2: accepted deviations — bestOf reduce bug fixed; Rahim delRate expectation corrected to "worse" (plan errors)
Task 2: review Needs fixes — 1 Important: confirm-then-cancel assigned orders double counted → yield > assigned. Ruling: new server counter confirmed_assigned_cancelled_count, subtract in yield/funnel — additive, existing rates unchanged.
Task 2: minor (deferred): ties give "best" to all (even 0%); delRate best computed over members with 0 assigned
Task 2: minor (deferred): delRate vs deliveredShare need clear UI labels; share grouping ties/"Other" name collision
Task 2: minor (deferred): test gaps (desc null-last, ties, clamps); brief git-add list omitted presentation test
Task 2: fix round 1/5 (1 addressed, 0 open — confirmed_assigned_cancelled_count overlap; commits 4be3c0d..df16bf8)
Task 2: minor (deferred): "unknown" orderId key fallback could collide (pre-existing)
Task 2: complete (commits 8806483..df16bf8, review clean after 1 fix round)
Task 3: minor (deferred): yield test doesn't sum segments to 100; escaping only tested on leaderboard tooltip
Task 3: minor (deferred): xAxis max 100 would hide overflow; rounded corners on empty first/last segment; #1 bar glow vs no-shadow rule (plan-mandated)
Task 3: complete (commits df16bf8..7ea8d18, review clean)
Task 4: note — dashboardBulkStatus.test.tsx failed once in full run, passed 9/9 alone twice (possible flake, unrelated)
Task 4: minor (deferred): SnapshotCard root not flex → sparkline mt-auto no-op, uneven tiles (plan-mandated)
Task 4: minor (deferred): hex literals #FAFAF8/#B4473A instead of tokens; Team contribution lacks empty state
Task 4: minor (deferred): contribution legend key by display name can collide; unnamed outer <section> wrappers
Task 4: minor (deferred): buildStaffTableRows x4 per data change (fine); test gaps (count sparkline, empty states)
Task 4: complete (commits 7ea8d18..339fdfd, review clean)
Task 5: review Needs fixes — 2 Important (plan-mandated): sort test ineffective (tie); detail funnel mixes populations vs Outcome mix. Ruling: distinct fixture + aria-sort; card built from row yield (assigned population).
Task 5: minor (deferred): "Review products" link no longer asserted; detail dropped delivered/cancelled/RTO ৳ values & rates
Task 5: minor (deferred): aria-controls to unrendered row; tied ranks; cart conversion >100% possible; product key ?? vs ||
Task 5: minor (deferred): hex literals vs tokens; text selection toggles row; unused StaffMetrics import; no page test for flags
Task 5: fix round 1/5 (2 addressed, 0 open — distinct sort fixture + aria-sort; detail card from yield; commits af8397b..8e1f0d7)
Task 5: complete (commits 339fdfd..8e1f0d7, review clean after 1 fix round)
Task 6: checks on 8e1f0d7 — 244 files/1616 tests; tsc 65; lint 0 errors; build OK; zrender not in main chunks
Task 6: visual QA (harness) — no overflow at 390px. Findings: (a) Order yield team markLine not drawn (MarkLineComponent not registered in src/lib/echarts.ts); (b) long names wrap in table name cell, "Former staff" breaks; (c) donut folds a single 5th member into "Other"
Final review: With fixes — Important: "In transit" is a catch-all + reconfirm double count; net vs gross confirmed/delivered labels disagree; charts reveal team totals to non-admins.
Ruling (#1): rename to "Open / in transit"; server single-bucket re-classification = follow-up — cost if wrong: segment mislabeled edge cases remain.
Ruling (#2): label net figures ("Confirmed, not cancelled", "Team delivered X% of assigned").
Ruling (#3): keep charts visible to team members — user approved mockup note "Every chart and the table below stay visible to the whole team"; API already returns all rows.
Fix wave dispatched with QA findings (markLine registration, name wrap, single "Other") + cleanups; findings in final-fix-findings.md; base 8e1f0d7
Final fix wave: 7/7 addressed (commits 8e1f0d7..769a9b7). Residual follow-up: lowercase "in transit" in funnel drop line and yield aria-label.
Final verification on 769a9b7: 244 files/1617 tests; tsc 65; lint 0 errors; build OK.
Handled-basis fix (2082259): review Needs fixes — handled sets mixed with per-activity counters (cancel rate 150% reproduced). Ruling: classify each (member, order) by member's LAST action; all handled_* counts distinct; products from last-action entries (fixes Loss double count). Minor deferred: Loss "—" when catalog weight missing; drive-by fixture fields; missing RED/GREEN output in audit.
