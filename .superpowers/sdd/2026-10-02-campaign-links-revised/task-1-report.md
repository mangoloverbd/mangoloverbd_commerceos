# Task 1 report: additive campaign database support

Status: `DONE_WITH_CONCERNS`, prepared 2026-10-03 for controller review.

Phase A is implemented and verified against disposable local PostgreSQL. No remote DDL/data writes, production orders, push, deployment, or original-checkout edits occurred. Task 2 commit `4f3d832` and its pure modules/tests are untouched. The controller's pre-existing untracked revised-plan copy is left unmodified and uncommitted.

## Task files

| File | Change |
| --- | --- |
| `supabase/migrations/20261002172503_campaign_links.sql` | CLI-created additive migration, campaign tables, attribution columns, constraints/indexes, privileges, triggers, and service-only RPCs |
| `src/integrations/supabase/types.ts` | Scoped merge from successful local CLI type generation, including four table definitions, order attribution/reconciliation fields, and three RPC definitions |
| `src/test/campaignLinksSchema.test.ts` | 14 real PostgreSQL integration tests |
| `src/test/helpers/campaignPostgres.ts` | Disposable cluster/bootstrap/migration helper and lock-observed transaction races |
| `scripts/verify-supabase-baseline.mjs` | Canonical campaign table inventory and least-privilege assertions |
| `.superpowers/sdd/2026-10-02-campaign-links-revised/task-1-report.md` | This handoff and verification record |

No backend route, application-startup DDL, Phase E field, retention TTL, reporting UI, or additional checkout event stream was added.

## Schema and persistence contracts

- `campaign_links` contains ID/workspace, slug/name/channel/destination, creator/post/notes metadata, `created_by`, archive time, and created/updated timestamps. Slugs are workspace-unique, length 3–60, with the approved lowercase/hyphen syntax. Names are nonblank and bounded to 120. Channels use the nine approved values. Creator name, HTTP(S) post URL, and notes are bounded to 120, 2048, and 2000 characters. Destination paths have basic relative-path/length/control-character checks; decoded URL/origin/loop normalization remains a server/storefront responsibility.
- `campaign_link_clicks` contains ID/workspace/link, internal request UUID, click time, optional visitor HMAC/referrer host/device, and bot flag. No raw IP or user agent columns exist. Click timestamps must be finite; visitor hashes are optional 64-character lowercase hex strings.
- `orders`, `abandoned_checkouts`, and `order_protection_reviews` receive nullable `campaign_link_id`, `campaign_click_id`, and `campaign_attributed_at`. All-null historical rows remain valid. Every nonnull attribution must contain the complete triple and a finite attribution timestamp.
- Composite foreign keys enforce workspace/link/click agreement. The click's `(org_id, link_id, id)` is the attribution target, and its own `(org_id, link_id)` references the link. References use `ON DELETE RESTRICT`.
- Campaign link IDs/workspaces cannot change. Slugs cannot change after any click, including a bot click. Direct service inserts/updates also execute the lock/identity triggers.
- An order's attribution freezes at insertion, including an all-null triple. Ordinary updates and later draft-ID/hash reconciliation remain possible, but campaign attribution cannot be added, changed, or cleared after insertion.
- Archive does not disable lookup or click logging. There is no hard-delete operation. Existing draft/review PII scrub patches and SQL retention routines preserve the new scalar attribution triple. The attribution window does not delete clicks.

Named indexes cover `(org_id, clicked_at, id)` and `(org_id, link_id, clicked_at, id)` on clicks, all three referencing attribution triples, and `(org_id, campaign_click_id)` on orders/captures. Existing `orders_org_abandoned_checkout_id_idx`, `orders_org_abandoned_draft_key_hash_idx`, and `abandoned_checkouts_org_id_draft_key_key` already cover reconciliation, so no duplicate indexes were added.

Both new tables enable RLS and have no browser policies. Explicit grants allow service-role SELECT/INSERT/UPDATE on links and SELECT/INSERT on clicks. Neither permits service-role DELETE/TRUNCATE; clicks also deny UPDATE. All new functions revoke default PUBLIC/anon/authenticated execution and grant execution to service role. RPCs use `SECURITY INVOKER`, an empty search path, qualified objects, and trusted workspace filters. The service role bypasses RLS by design, so callers must resolve the fixed Mango Lover BD workspace themselves.

## RPC interfaces for later tasks

All three RPCs return row sets, represented by arrays in Supabase responses. They are server-only operations.

```sql
public.rename_campaign_link(
  p_org_id uuid,
  p_link_id uuid,
  p_slug text
) returns setof public.campaign_links

public.record_campaign_link_click(
  p_org_id uuid,
  p_link_id uuid,
  p_slug text,
  p_request_id uuid,
  p_visitor_hash text default null,
  p_referrer_host text default null,
  p_device text default 'unknown',
  p_is_bot boolean default false
) returns setof public.campaign_link_clicks

public.attribute_campaign_checkout(
  p_org_id uuid,
  p_checkout_id uuid,
  p_click_id uuid,
  p_effective_at timestamptz
) returns setof public.abandoned_checkouts
```

### Rename and click recording

Both operations acquire `FOR UPDATE` on the same workspace/link row before checking or writing. A first click that commits first locks the slug. A rename that commits first makes a lookup using the old slug stale; click recording then rejects it rather than misattributing the old URL. A new lookup with the renamed slug can succeed.

`p_request_id` must remain the same across retries of one proxy request. Uniqueness is `(org_id, request_id)`. A retry on the same link returns the original click ID/timestamp/metadata without another insert; the same request UUID on another link raises an error. Archived links still accept clicks.

| Condition | SQLSTATE/message |
| --- | --- |
| Missing/foreign link, or stale expected slug on click recording | `P0002`, `campaign link not found` |
| Changed slug after any click | `23514`, `campaign slug is locked after its first click` |
| Link ID/workspace mutation | `23514`, `campaign link identity is immutable` |
| Request UUID already attached to another workspace-local link | `23505`, `request belongs to another campaign link` |
| Invalid metadata or duplicate workspace slug | Normal CHECK/UNIQUE constraint error |

Keep lookup/navigation error handling separate from recording errors. A click-write failure must not discard already-resolved destination/UTM metadata. These RPCs do not implement HTTP fallback behavior.

### Draft attribution

Call `attribute_campaign_checkout` separately after normal capture persistence so a marketing write failure cannot roll back capture. Generate `p_effective_at` server-side and pass only a validated candidate click UUID.

The RPC locks the workspace/draft row and returns no rows for a missing/foreign draft. It returns an unchanged existing draft for null/nonfinite effective time, a missing/foreign/bot/future/expired click, or a draft that is no longer open/contacted or has expired. Eligibility is exactly 720 elapsed hours, inclusive at both ends. Direct/null input is not a clear operation.

A valid incoming click replaces the saved attribution only when its click timestamp is at least as recent as the saved click. The comparison and update happen under the draft lock, so reordered requests cannot overwrite a newer click with an older one. Equal timestamps permit the incoming candidate to win. This does not extend the order attribution window: intake/recovery must validate again with the appropriate original-submission or conversion time, and insert the final triple with the order.

Held-review attribution persistence and copying the validated final triple into a new order remain later integration tasks. No RPC attempts to backfill an existing order. Order-attribution changes raise `23514`, `order campaign attribution is immutable`.

## Actual verification evidence

Environment: PostgreSQL 18.4 Homebrew, Supabase CLI 2.119.0. Tests require local `initdb`, `pg_ctl`, `psql`, and `pg_config` on PATH or through `PG_BINDIR`. They fail clearly if these are absent rather than silently skipping database verification.

| Command/check | Result on this continuation |
| --- | --- |
| `npm test -- src/test/campaignLinksSchema.test.ts` | 14/14 passed after the final helper fix; all 14 also passed in the final full-suite run |
| `npm run verify:supabase-baseline` | Both independent local resets passed |
| `SUPABASE_URL=https://ldiktvcavyabivpxfwpn.supabase.co npm run verify:supabase-project` | Passed project-reference agreement across the worktree configs |
| Local CLI `gen types --db-url ... --schema public` | Exit 0; fresh generated output includes the campaign tables, attribution columns, and all three RPCs |
| In-memory TypeScript equivalence check against that output | Passed for four complete table definitions, three complete RPC definitions, and five order fields across Row/Insert/Update |
| `npm test` | Final run: 256 files passed, 1 file failed; 1936 tests passed, 1 failed, 1937 total |
| `npm test -- src/test/dashboardOrderStatusFilter.test.tsx` | The same unrelated navigation-state assertion failed at line 331; 18 passed, 1 failed |
| `npm run lint` | Exit 0; 37 warnings in untouched files |
| Explicit ESLint on all four changed JS/TS files | Exit 0, no warnings/errors |
| `npm run build` | Exit 0; existing `bdDistricts.ts` duplicate-key and large-chunk warnings |
| `npx tsc --noEmit -p tsconfig.app.json` | Exit 2 with 63 diagnostics outside Task 1 files; no task-file diagnostics remain |
| TypeScript compiler comparison using original HEAD types through an in-memory overlay | Both versions had the same 63 diagnostics; 0 introduced diagnostics |
| `git diff --check` | Passed before staging |

The worktree lacks a configured `SUPABASE_URL`, so an unqualified project preflight first failed with that missing-variable message. Supplying the documented canonical public URL allowed the config-only preflight to pass; no secret or remote database connection was required.

The 14 database tests exercise migration preservation and old unattributed inserts, metadata validation, all incomplete triples and mismatched foreign keys, browser permissions/RPC denials, service history protection, sequential and concurrent request deduplication, archive behavior, bot-click slug freezing, both rename/click transaction orders, exact attribution-window boundaries, reordered draft writes, retention scrubbing, immutable order attribution, reconciliation, and actual index definitions.

Race tests hold the winning transaction open and require the competing connection to report `wait_event_type = 'Lock'` before releasing it. They do not merely start two promises and assume overlap. The first full-suite rerun exposed one observer timeout because a DO transaction cached the backend list before the competitor connected. A separate delayed-session probe reproduced that miss and then observed the session with `pg_stat_clear_snapshot()`. The helper now refreshes the snapshot on every poll. The next focused and full-suite runs passed all campaign race tests.

Earlier TDD evidence from the uninterrupted implementation recorded 13 failures before the migration existed, followed by 14 passing schema tests. The earlier full-suite pass was 1786 tests before Task 2's 151 tests were added. This report uses the latest 1937-test result rather than presenting that earlier pass as current.

## Type-generation evidence and limitation

Fresh generation ran against the disposable database with every canonical migration applied, without Docker or a linked/remote project:

```bash
npx --yes tsx --eval 'import { startCampaignPostgres } from "./src/test/helpers/campaignPostgres.ts"; import { execFileSync } from "node:child_process"; import { userInfo } from "node:os"; const db = startCampaignPostgres(); try { const url = `postgresql://${userInfo().username}@localhost/postgres?host=${encodeURIComponent(db.socket)}`; process.stdout.write(execFileSync("npx", ["--yes", "supabase", "gen", "types", "--db-url", url, "--schema", "public"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })); } finally { db.stop(); }'
```

Complete fresh output is retained in this local session at `/Users/noorkarimmehedi/.local/share/opencode/shell/1ec14239676cf3723851aaa58e2e3fd9b1148960/sh_0fdec19c40011n6uRZWnLHUJXf.out`. The generator emitted unformatted TypeScript; the integrated definitions follow the repository's existing formatting. RPC return rows use equivalent `Database[...]["Row"][]` references instead of duplicated inline definitions, verified by bidirectional TypeScript assignability.

This is a scoped generated-type merge, not a whole-file regeneration. The old checked-in types omit several unrelated canonical tables/fields. Replacing everything would include unrelated type changes, and local pgvector is absent. The helper uses the existing baseline verifier's optional vector adaptation, replacing the unrelated vector column with text and omitting its search RPC locally. Campaign SQL is unchanged. The existing vector-related checked-in types/RPC are preserved. A full canonical regeneration on a vector-enabled local stack remains a separate cleanup item.

## Self-review and controller concerns

Completed a two-pass self-review using `/Users/noorkarimmehedi/.agents/skills/gstack/review/checklist.md`, plus the task brief and Supabase security/locking/index guidance. The first attempted checklist path under `.claude/skills` did not exist; the actual `.agents/skills` copy was found and read. This is a self-review, not an independent-agent approval or production readiness claim.

The review checked additive/data-preserving DDL, all FK/index combinations, least privilege and PUBLIC revocation, qualified invoker functions, both link-lock orderings, retry uniqueness waits, trusted workspace filters, exact elapsed-time boundaries, retained historical linkage, and startup/application compatibility. The helper's ES2021-only `replaceAll` was replaced with a target-compatible global regex, and the cached-statistics observer failure was corrected. No unresolved Task 1 schema defect was found.

Remaining concerns for controller review:

1. The final full suite is not clean because `dashboardOrderStatusFilter.test.tsx:331` expects `Cancelled Customer` before the returned navigation-state view contains it. This reproduces without running the campaign schema tests. The test and dashboard files are unchanged; no unrelated fix was made.
2. Whole-project TypeScript checking remains blocked by 63 existing diagnostics. `npm run build` runs Vite, not `tsc`, so its success is not a whole-project type-check pass. The scoped generated definitions add no compiler diagnostics.
3. Types were generated successfully but merged only for Task 1's dependencies. Full unrelated schema/type drift and vector-enabled regeneration remain unaddressed.
4. Local verification uses Supabase-compatible role/auth/storage stubs, not a running PostgREST/Auth stack. Real SQL grants, RLS, constraints, and transaction behavior were tested; deployed HTTP RPC behavior and browser QA are later integration checks.
5. Read-only inspection earlier in this task found broad existing anon/authenticated table grants on remote `orders`, with RLS enabled and only a service-role policy. That is privilege drift, not demonstrated browser row exposure. The pre-existing review-to-draft FK references draft ID alone and uses `ON DELETE SET NULL`; it lacks a workspace-composite guard. Neither unrelated remote condition was changed.
6. Inspection found no authoritative partial-delivery merchandise amount. Later reporting must retain the approved null revenue/completeness reason rather than invent an amount. Phase E and production deployment remain excluded.

The migration is committed for controller review only. Deployment still needs explicit authorization and the required project/baseline preflight against the intended target.
