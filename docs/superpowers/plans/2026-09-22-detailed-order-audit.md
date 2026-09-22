# Detailed Order Audit Corrective Completion Plan

**Goal:** Finish a readable, reason-aware, best-effort audit trail across every Mango Lover BD order-editing and operational surface, then verify it end to end.

**Status:** Schema, core helpers, three editor integrations, and the inline timeline are partially implemented on `feat/detailed-order-audit`. Preserve those commits and execute only the corrections and missing work below.

## Global constraints

- Resolve the authenticated user and fixed Mango Lover BD `org_id` for every route and query.
- Frontend requests use `apiFetch()` only.
- Exact values stay inside authorized per-order timelines; the global Activity Log stays summary-only.
- Original provenance is immutable. Existing rows receive no inferred history.
- Audit writes remain best-effort after business mutations. Log failures and do not describe the trail as gap-free or compliance-grade.
- Use test-first red-green-refactor cycles for every remaining behavior.
- Preserve unrelated local work, including `opencode.json` changes.

## What already exists

- `order_status_events` remains the compatibility source for historical status attribution.
- Existing regular, inbox, and abandoned mutation routes retain mature business validation.
- `order_activity_events`, provenance/cancellation columns, service-role-only grants, indexes, and baseline verification exist.
- `server/orderActivity.js` provides allowlists, reason validation, diffs, grouping, view buckets, and safe event construction.
- Regular, abandoned, and inbox editors have partial group-ID, reason, meaningful-view, and timeline wiring.
- The inline timeline renders provenance, five recent groups, reasons, and expandable before/after values.
- Existing report helpers and print utilities are reused rather than replaced.

## NOT in scope

- One atomic editor RPC. Existing mutation routes stay; the UI recovers explicitly from partial saves.
- Gap-free transactional audit persistence. A durable-outbox follow-up is in `TODOS.md`.
- Historical activity backfill or inferred provenance.
- Public storefront access to detailed activity.
- Device fingerprints, IP addresses, or browser identifiers.
- Proof that paper was physically printed. `document.printed` means print flow initiated.

## Data flow

```text
Editor/queue action
  -> authenticated Express route -> fixed org_id
  -> validate reason + expected version + operation key
  -> existing business mutation -> committed server state
  -> typed before/after diff -> best-effort detailed event
       group_id: presentation grouping
       request_id: per-operation replay dedupe
       legacy_status_event_id: exact dual-read reconciliation
  -> invalidate/refetch timeline

Activity Log: detailed page + legacy page -> bounded timestamp merge -> safe summaries
Staff report: in-range upsells -> changes through period end -> retained count/value
```

## 1. Mutation coverage and correctness

- [ ] Add a source-level inventory test for every regular and inbox status-mutation caller.
- [ ] Add structured cancellation reasons to Dashboard `OrdersTable` and every other staff cancellation caller; `other` requires a note.
- [ ] Keep courier/system transitions exempt from staff forms while recording normalized reasons.
- [ ] Write stale-save tests for regular, inbox, and abandoned mutations.
- [ ] Send an expected row version (`updated_at` where reliable, otherwise an additive version) and perform a conditional write that returns `409` when stale.
- [ ] Refetch and show a clear conflict prompt instead of overwriting or misattributing concurrent changes.
- [ ] Keep one client `group_id` per Save, but derive a distinct stable `request_id` for each group + order + route segment.
- [ ] Test replay after a lost response without deduplicating legitimate events in the same group.
- [ ] Test a partial Save where customer/items persist and totals/status fails.
- [ ] On partial failure, refetch, identify saved versus unsaved sections, retain only unsaved edits, and retry with a new group ID.

## 2. Provenance and dual-read correctness

- [ ] Verify immutable provenance and `order.created` activity for manual, telesales, social inbox, Shopify, storefront, abandoned conversion, API/integration, and system creation.
- [ ] Add missing writers without accepting origin fields from clients.
- [ ] Verify existing rows show `history.started` with no fabricated creation event.
- [ ] Generate the legacy status-event ID before dual-writing a detailed status event.
- [ ] Allow safe `legacy_status_event_id` metadata and suppress only that exact linked legacy row.
- [ ] Retain the two-second heuristic only for already-written unlinked rows.
- [ ] Test two distinct rapid status changes by the same actor.

## 3. Operations, print, and deletion

- [ ] Add tests for `fraud.checked`, `fraud.overridden`, `message.sent`, `message.failed`, `courier.submitted`, `courier.failed`, and `courier.status_changed`.
- [ ] Store bounded normalized failure codes plus provider/status only; never copy raw provider payloads into audit metadata.
- [ ] Instrument regular and inbox courier routes, bulk per-order outcomes, and courier webhooks.
- [ ] Add one authenticated batch print-activity endpoint with server-validated order table, document type, IDs, `org_id` guards, and batch cap.
- [ ] Call it only after invoice, label, or packing-summary print flow initializes successfully.
- [ ] Capture safe references before regular/inbox deletion and write `order.deleted` only after successful deletion.
- [ ] Keep deleted-order global summaries free of customer values.

## 4. Reporting

### Bounded Activity Log

- [ ] Replace full-history loading with bounded queries from detailed and legacy sources.
- [ ] Merge bounded sorted streams by timestamp and use separate count queries for filters.
- [ ] Test mixed ordering, page boundaries, no duplicates, action filters, and summary redaction.

### Retained net upsell

- [ ] Credit only `upsell` additions/increases created inside the report range.
- [ ] Apply reductions through the selected range end; all-time reports use history through now.
- [ ] Allocate same-item reductions proportionally across active staff lots, never FIFO/LIFO.
- [ ] Reduce value for item and order discounts without going negative.
- [ ] Zero credit for cancelled, rejected, deleted, or fully returned orders.
- [ ] Keep credit for active/delivered orders; prorate partial returns only when explicit quantities exist.
- [ ] Ensure staff filters select output rows but never alter allocation.
- [ ] Present retained count and value in Staff Performance.

## 5. Verification and rollout

### Required test matrix

- [ ] Pure helpers: validation, diffs, grouping, safe metadata, operation keys, proportional allocation, cutoff, discounts, and terminal outcomes.
- [ ] Routes: auth, workspace guard, stale versions, replay, view dedupe, all creation paths, every cancellation caller, operations, print, deletion, and detailed-table fallback.
- [ ] Components: reasons, partial/conflict recovery, five-row collapse, expansion, actors, and global redaction.
- [ ] Browser QA: regular editor, Dashboard cancellation, abandoned editor, inbox cancellation/activity, print actions, Activity Log pagination, and Staff Performance upsell.
- [ ] Regression: order editing, courier dispatch, fraud checks, printing, and legacy Staff Performance.

### Failure modes

| Failure | Handling | Verification |
|---|---|---|
| Audit insert unavailable | mutation stays authoritative; contextual log | route failure test |
| Replayed request | stable operation key dedupes event | replay test |
| Concurrent edit | conditional write returns 409; UI refetches | route + component tests |
| Later Save segment fails | refetch and explicit partial result | component + browser QA |
| Provider error contains data | normalized code; raw payload omitted | metadata test |
| Detailed table unavailable | legacy timeline fallback | route fallback test |
| Rapid dual writes | exact legacy ID link | reconciliation test |
| High-volume views | unique bucket + bounded reports | concurrency/pagination tests |

### Rollout gate

1. Run `npm run verify:supabase-project` and `npm run verify:supabase-baseline`.
2. Apply the additive migration before application code.
3. Verify table, columns, grants, RLS, constraints, and indexes as a hard gate.
4. Deploy writers/readers and UI only after readiness passes.
5. Roll back code while leaving additive schema intact.
6. Run Supabase security/performance advisors, focused tests, full tests, lint, build, review, and browser QA.

## Parallelization strategy

| Lane | Work | Depends on |
|---|---|---|
| A | mutation coverage, concurrency, partial-save recovery | schema/helpers |
| B | provenance and legacy linkage | schema/helpers |
| C | operations, print, deletion | writer/helpers |
| D | Activity Log and upsell | event shapes from B/C |
| E | browser QA and rollout | A–D |

Lanes A–C all touch `server/index.js`, so implement them sequentially. Pure reporting helpers/tests can proceed independently; final integration remains sequential.

## Implementation Tasks

- [ ] **T1 (P1, human: ~1 day / CC: ~60 min)** — Cover all cancellations, optimistic conflicts, operation keys, and partial-save recovery.
- [ ] **T2 (P1, human: ~4h / CC: ~30 min)** — Complete creation provenance and exact legacy linkage.
- [ ] **T3 (P1, human: ~1 day / CC: ~60 min)** — Complete safe operation, print, courier-status, and deletion events.
- [ ] **T4 (P1, human: ~1 day / CC: ~60 min)** — Implement bounded Activity Log merge and approved upsell accounting.
- [ ] **T5 (P1, human: ~1 day / CC: ~90 min)** — Run the full matrix, migration checks, review, and browser QA.

## GSTACK REVIEW REPORT

### Runs / Status / Findings

| Run | Status | Findings |
|---|---|---|
| Scope challenge | Full scope accepted | File spread follows existing surfaces |
| Architecture | 2 resolved | Print API boundary; period-end upsell snapshot |
| Code quality | 2 resolved | Proportional reductions; normalized failures |
| Tests | 1 resolved | Full route/component/browser matrix |
| Performance | 1 resolved | Bounded dual-source Activity Log merge |
| Outside voice | Completed | Findings incorporated or explicitly scoped |

### Approved decisions

- Preserve full scope and cover every cancellation caller.
- Add authenticated batch print activity.
- Recover explicitly from partial saves and stale conflicts.
- Keep best-effort durability and disclose its limit.
- Separate grouping from per-operation idempotency.
- Link detailed statuses to exact legacy rows.
- Measure upsell at period end, reduce shared lots proportionally, and zero terminal losses.
- Normalize failure metadata and bound global report reads.
- Require migration-first deployment readiness.

### Completion Summary

- Step 0: scope accepted as-is.
- Architecture: 2 issues resolved.
- Code quality: 2 issues resolved.
- Tests: diagram produced; full matrix approved.
- Performance: 1 issue resolved.
- NOT in scope and existing foundations: written.
- TODO updates: 1 approved durability follow-up.
- Failure modes: 0 silent critical gaps remain in the plan.
- Outside voice: Codex completed; all substantive findings resolved.
- Parallelization: 5 lanes, mostly sequential due to shared server module.
- Lake Score: 6/6 complete options chosen.
- Unresolved decisions: 0.

VERDICT: APPROVED WITH CORRECTIVE TASKS

NO UNRESOLVED DECISIONS
