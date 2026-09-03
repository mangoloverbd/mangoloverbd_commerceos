# Task 1 Implementation Report

## Status

DONE_WITH_CONCERNS

## Files Changed

- `supabase/migrations/20260902224522_add_order_items.sql`
- `src/integrations/supabase/types.ts`
- `src/test/order-items.test.ts`

The pre-existing modification in `server/index.js` was not edited or staged.

## Commit

- Commit: `1872100` (`feat: add order item records`)
- The migration filename uses the version reported by the project Supabase migration history (`20260902224522_add_order_items`), rather than the initially generated local timestamp.

## Tests And Verification

- `npm run verify:supabase-project`
  - Passed: `Supabase project preflight passed: ldiktvcavyabivpxfwpn`
- `npm run verify:supabase-baseline`
  - Passed twice: `Baseline reset 1: passed`, `Baseline reset 2: passed`
- `npm test -- src/test/order-items.test.ts`
  - RED first: 4 of 5 tests failed against the empty migration.
  - GREEN: 5 tests passed.
- `npm test`
  - Passed: 51 test files, 247 tests.
- `npm run lint`
  - Passed with 0 errors and 30 existing warnings.
- `npm run build`
  - Passed: Vite production build completed successfully.
- `git diff --cached --check`
  - Passed.
- Live Supabase verification query
  - 3 orders, 3 orders with items, 4 items, 0 invalid items.
  - Parsed quantities are 2, 2+2, and 1 for the current orders.
  - Each order's item aggregate equals its existing `orders.price`.

## Schema Decisions

- Added the exact requested `order_items` columns with UUID identity, snapshot names, numeric unit price, positive integer quantity, and created/updated timestamps.
- Added foreign keys to `orders`, `products`, and `product_variants`; product and variant references are nullable and use `ON DELETE SET NULL`.
- Added `(org_id, order_id)`, `(org_id, product_id)`, and `(org_id, variant_id)` indexes, with partial indexes for optional catalog references.
- Added a trigger that rejects order, product, or variant references whose `org_id` does not match the item workspace.
- Added the existing `update_updated_at_column()` trigger for item updates.
- Enabled RLS and revoked `anon`/`authenticated` table access; granted table/function access only to `service_role`, matching the existing private server-only commerce model.
- Backfill splits legacy cart text on `+`, parses `Nx` quantities using PostgreSQL-compatible POSIX regexes, resolves the longest same-workspace catalog product name, and retains unmatched text in `product_name` with nullable catalog references.
- Backfill is idempotent per `(org_id, order_id)` and guarantees a fallback item for blank or unrecognized product text. Existing aggregate order fields are not updated.
- Generated Supabase types were updated with the complete `order_items` table and all three relationships while preserving the repository's existing generated PostgREST version.

## Concerns

- Supabase security advisors report `RLS enabled no policy` for `public.order_items`. This is intentional: the repository's private merchant model revokes browser commerce access and uses the authenticated Express service API. Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Supabase performance advisors report informational unindexed foreign-key findings for the new table, despite the required workspace-oriented indexes. The indexes are intentionally shaped around application queries `(org_id, ...)`; if future delete/update workloads require parent-key-only scans, add dedicated FK-leading indexes in a later performance task.
- The remote migration was applied and its generated backfill rows were corrected once after live verification exposed PostgreSQL regex-dialect incompatibility. The committed migration contains the corrected POSIX parser and is safe for a fresh deployment.

## Review Fixes

- Replaced structural-only item tests with executable coverage against a fresh local PostgreSQL database bootstrapped from the canonical schema and task migration.
- Added coverage for positive quantities, non-negative prices, every-order preservation, unmatched legacy fallback text, exact aggregate totals, and workspace ownership.
- Added composite workspace foreign keys from `order_items` to orders, products, and variants, with unique parent indexes. Parent `org_id` changes now fail rather than drifting existing items across workspaces.
- Changed backfill pricing to preserve the order total exactly by calculating unrounded line prices and assigning any arithmetic remainder to the final parsed line. Legacy splitting now tolerates missing whitespace around `+`.

## Review Fix Verification

- `npm test -- src/test/order-items.test.ts`
  - RED before migration fixes: 1 test failed (`prevents parent workspace changes from drifting existing items`). After exposing the odd-cent aggregate case, the aggregate test also failed against the old rounding behavior. GREEN: 6 tests passed.
- `npm test`
  - Passed: 51 test files, 248 tests.
- `npm run lint`
  - Passed with 0 errors and 30 existing warnings.
- `npm run build`
  - Passed: Vite production build completed successfully.
- `npm run verify:supabase-project && npm run verify:supabase-baseline`
  - Passed: `Supabase project preflight passed: ldiktvcavyabivpxfwpn`; `Baseline reset 1: passed`; `Baseline reset 2: passed`.
