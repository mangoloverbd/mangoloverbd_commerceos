# Customer profile design

Approved in conversation on 2026-09-30. The customer page supports order handling and repeat sales, with operational information first. The user requested implementation and selected an isolated worktree, the full scope, separate phone-less profiles, and indexed normalized-phone lookups.

## Scope

- Protected `/customers/:id` page, reachable from desktop/mobile customer lists and order detail.
- Identity, latest and historical delivery addresses, first/latest order dates and source channels.
- Active orders, paginated cross-channel history, delivery outcomes and courier identifiers.
- Separate total order value and fully delivered order value; never describe either as collected revenue. Partial deliveries do not contribute their full value to delivered value. Pending return requests are not completed returns.
- Delivered product purchase patterns, recency and factual follow-up guidance. Existing automated lifecycle/campaign labels remain labeled as rule-based; the 45-day dormant rule does not trigger automatic campaigns.
- Existing SMS dialog, phone copy/call and prefilled order creation.
- Append-only internal notes with author/date, manual tags and follow-up date/reason.
- Existing recorded order activity, bounded and paginated, with no invented communication history.

## Identity and data

Valid Bangladeshi phone numbers remain the grouping key. Invalid or missing phone numbers use `order:<uuid>` or `social:<uuid>`, not names. Shared numbers are explicitly described as phone-based profiles, not verified people. The most recent nonempty name/address wins; historical orders remain unchanged.

Generated, indexed `customer_phone_key` columns use the same normalization rules as the application. Inbox phone/address fields come from structured notes when no direct field exists. All reads resolve the fixed Mango Lover BD workspace and apply `org_id`; clients cannot choose a workspace.

There is currently no explicit inbox-to-main-order conversion link in the deployed schema. Do not invent deduplication based on amount/name/time. Explain this limitation and only deduplicate explicit identity links if subsequently introduced.

`customer_profiles` stores manual tags, follow-up fields and a version for optimistic concurrency. `customer_notes` stores append-only notes and trusted author snapshots. Tables have RLS enabled, browser access revoked and service-role-only grants. A version mismatch returns 409 instead of silently replacing another staff member's edits. Note IDs make retries idempotent.

## Architecture

```
List / order detail -> protected profile route -> apiFetch + TanStack Query
  -> authenticated Express handlers -> resolved workspace
    -> indexed matching orders + inbox orders
    -> pure profile aggregation in server/customerProfile.js
    -> scoped profile context + notes + recorded activity
```

Routes remain in `server/index.js`. Pure profile logic and validation have a focused helper module. Notes/context writes never update orders. API sections use independent pagination and preserve loading/error/empty states. Missing migration produces a clear 503 rather than empty customer information.

## Interface

Warm off-white, Geist, borderless sections, Phosphor light icons. Header identity/actions, operational and purchase metrics, main history/activity, and a staff-context column. Responsive stacking on mobile. Customer rows/cards and name links open profiles; checkboxes continue bulk selection and phone-copy does neither. Search/filter/sort/page state survives returning to the customer queue. Row/card opening replaces selection-on-row-click at the user's request during testing.

## Excluded

Automatic campaigns, AI scoring, merges, preferred-address editing, communication history not already recorded, and inferred conversation matching. Changing an order's phone never migrates notes or context: records remain attached to the original key. If that key has no matching orders, recovery needs an explicitly reviewed data-repair operation, not an implicit merge.

Production application deployment is not authorized. After testing locally, the user explicitly approved applying the customer-profile migration to the shared Mango Lover BD database. Migration `20260930155613_customer_profiles.sql` was applied on 2026-09-30; its local version matches Supabase's recorded version. Existing 2,205 orders and zero inbox orders were preserved. Browser QA was explicitly skipped by the user; automated component/handler tests and a live scoped read-only profile-handler check replace it, not a claim of browser verification.

## Verification

Unit tests cover identity, chronological selection, value/outcome definitions, structured items, missing data and input limits. API tests exercise actual registered handlers against controlled dependencies for auth, workspace filtering, pagination, conflicts and write failures. Component tests cover navigation, manual context/note persistence, retry/error behavior, SMS and prefill. Apply all migrations to ephemeral local Postgres and verify grants, normalization and concurrency. Run the full suite, build, focused lint and browser QA with controlled fixtures if signed-in access is unavailable.
