# Custom Store Order Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make uniquely identifiable custom-site orders appear as catalog-linked, image-backed, editable dashboard orders while preserving safe fallback behavior for ambiguous legacy text.

**Architecture:** Extend the existing pure variant-matching module with deterministic product/variant text matching. Add one workspace-scoped resolver in `server/index.js`, reuse it for routing, historical detail enrichment, and custom webhook ingestion, and use the existing transactional `replace_order_items` RPC for all future matched webhook inventory changes.

**Tech Stack:** Node.js 20, Express, Supabase PostgreSQL/RPC, Vitest.

## Global Constraints

- Preserve all existing uncommitted three-column editor work.
- Every catalog, order, variant, and order-item query must retain the resolved Mango Lover BD `org_id` guard.
- Prices and stock changes remain server-authoritative.
- Inventory and item creation for matched future orders must use `replace_order_items`.
- Do not apply a migration remotely.
- Test first and verify focused tests, full tests, lint, build, and diff whitespace.

---

### Task 1: Deterministic legacy catalog matching

**Files:**
- Modify: `server/variantMatching.js`
- Modify: `src/test/inboxVariantCapture.test.ts`

**Interfaces:**
- Produces: `matchProductFromText({ text, products })` returning one product or `null`.
- Produces: `matchVariantIdFromText({ text, variants })` returning one variant ID or `null`.

- [x] **Step 1: Write failing matcher tests**

Cover the exact `Sundarbans Natural Honey - 0.5KG` payload, longest unique product selection, duplicate-name ambiguity, unique variant attributes, ambiguous variants, and empty input.

- [x] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/test/inboxVariantCapture.test.ts`

- [x] **Step 3: Implement minimal pure matching helpers**

Normalize case and whitespace, require deterministic matches, select a product only when the longest match is unique, and match all variant attribute values against delimited legacy text.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run src/test/inboxVariantCapture.test.ts`

### Task 2: Reuse catalog resolution across order flows

**Files:**
- Modify: `server/index.js`
- Modify: `src/test/orderRoutingWiring.test.ts`
- Modify: `src/test/order-items.test.ts`

**Interfaces:**
- Produces: workspace-scoped `resolveOrderCatalogItems(supabase, orgId, items)` results with canonical IDs and an explicit complete-match flag.
- Updates: `resolveOrderRouting()` to expose resolved items without changing existing warehouse/weight behavior.

- [x] **Step 1: Write failing source-contract regression tests**

Assert that detail fallback invokes shared resolution, unresolved historical stock is not treated as previously reserved, the custom webhook invokes `replace_order_items` only after a complete match, failure cleanup retains the workspace guard, and SMS occurs only after item persistence.

- [x] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run src/test/orderRoutingWiring.test.ts src/test/order-items.test.ts`

- [x] **Step 3: Implement the shared workspace-scoped resolver**

Reuse pure matching helpers, page product reads, query only matched products' variants, retain direct IDs, and mark inferred product-only matches incomplete when a variant choice remains ambiguous.

- [x] **Step 4: Repair historical detail responses without mutating on GET**

For synthesized legacy rows, copy canonical IDs only from complete matches, strip internal resolver metadata from the response, enrich images normally, and report current stock without adding the unreserved legacy quantity.

- [x] **Step 5: Persist future matched webhook items transactionally**

After order insertion, call `replace_order_items` with canonical IDs and quantity. On RPC failure, delete only the newly inserted order in the same workspace and return the error. Send SMS only after this succeeds.

- [x] **Step 6: Run focused tests and verify GREEN**

Run: `npx vitest run src/test/inboxVariantCapture.test.ts src/test/orderRoutingWiring.test.ts src/test/order-items.test.ts`

### Task 3: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-09-05-custom-store-order-linking.md`

- [x] **Step 1: Run the complete verification suite**

Run: `npm test && npm run lint && npm run build && git diff --check`

- [x] **Step 2: Confirm Supabase project and baseline**

Run: `npm run verify:supabase-project && npm run verify:supabase-baseline`

- [x] **Step 3: Review the final diff**

Confirm no secret, raw tenant input, unguarded user-data query, client-supplied price, or non-transactional matched-order inventory mutation was introduced.

## What already exists

- `server/variantMatching.js` already normalizes and uniquely matches variant labels; extend it instead of creating a parallel parser.
- `resolveOrderRouting()` already performs workspace-scoped product-name lookup and pagination; factor its lookup into the shared resolver.
- `replace_order_items` already owns ordered locks, stock deltas, authoritative price calculation, item replacement, and order totals.
- `enrichOrderItems()` already resolves primary product images and editable stock once catalog IDs are present.

## NOT in scope

- Bulk historical reconciliation, because old inventory reservation state cannot be inferred safely.
- Remote migration application, because this fix needs no new schema and deployment remains a separate approved workflow.
- Fuzzy matching, because a false catalog link can mutate the wrong stock.
- Storefront payload redesign, because the linked custom site currently sends product text through the compatibility webhook.

## Failure modes

| Failure | Handling | Test |
|---|---|---|
| Product text matches multiple equal candidates | Keep detached; no inventory mutation | Unit matcher test |
| Product has multiple variants and no unique attribute match | Keep detached; no inventory mutation | Unit matcher test |
| Variant stock is insufficient | RPC rolls back; API deletes new order; no SMS | Route contract + existing RPC tests |
| Historical item was never reserved | Detail reports current stock without adding quantity | Detail contract test |
| Catalog lookup fails | Existing route error handling returns an error; no guessed link | Route contract test |

## Test coverage diagram

```text
CODE PATHS                                      USER FLOWS
[+] variantMatching.js                         [+] Open historical #1011
  +-- exact unique product [unit]                 +-- linked image [contract + matcher]
  +-- longest unique product [unit]               +-- editable IDs [contract]
  +-- duplicate ambiguity [unit]                  +-- stock not overstated [contract]
  +-- unique variant [unit]
  +-- ambiguous variant [unit]                  [+] Receive future custom order
[+] server/index.js                               +-- unique match -> RPC [contract]
  +-- workspace catalog lookup [contract]         +-- RPC failure -> cleanup/no SMS [contract]
  +-- detail virtual match [contract]              +-- ambiguity -> legacy fallback [unit]
  +-- webhook RPC success [contract]
  +-- webhook RPC failure cleanup [contract]
```

Sequential implementation, no parallelization opportunity.

## Implementation Tasks

- [x] **T1 (P1, human: ~2h / CC: ~15min)** — Matching — Add deterministic product and variant matching for legacy custom-site text.
  - Surfaced by: Architecture review — wrong matches could mutate unrelated inventory.
  - Files: `server/variantMatching.js`, `src/test/inboxVariantCapture.test.ts`
  - Verify: `npx vitest run src/test/inboxVariantCapture.test.ts`
- [x] **T2 (P1, human: ~4h / CC: ~25min)** — Orders API — Reuse matching in detail, routing, and webhook persistence with RPC cleanup.
  - Surfaced by: Architecture and test review — historical display and future reservation must use the same identity rule.
  - Files: `server/index.js`, `src/test/orderRoutingWiring.test.ts`, `src/test/order-items.test.ts`
  - Verify: `npx vitest run src/test/orderRoutingWiring.test.ts src/test/order-items.test.ts`
- [x] **T3 (P1, human: ~1h / CC: ~10min)** — Verification — Run full tests and static checks.
  - Surfaced by: Test review — regression touches order ingestion, inventory, and editing.
  - Files: repository-wide verification only
  - Verify: `npm test && npm run lint && npm run build && git diff --check`

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | Not run | Bug fix does not require product-scope review |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | Unavailable | Codex workspace was out of credits |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 1 pricing-response issue found and fixed; 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | Not run | No visual design change |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | Not run | No developer-facing workflow change |

- **VERDICT:** ENG CLEARED — implemented and verified.

NO UNRESOLVED DECISIONS
