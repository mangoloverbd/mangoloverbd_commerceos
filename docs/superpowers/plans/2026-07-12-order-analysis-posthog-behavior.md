# Order Analysis PostHog Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Website Funnel, Conversion Drop-off, and Product Demand Signals to Order Analysis using SaaS-owned PostHog data.

**Architecture:** Add one authenticated backend route that queries PostHog HogQL with an `org_id` filter resolved from the logged-in user. Add one frontend query and panel in `OrderAnalysis.tsx` directly after the forecast metric cards. Missing PostHog query credentials returns an empty configured-false response instead of breaking the page.

**Tech Stack:** Express.js, Supabase Auth helpers, PostHog HogQL over Node `fetch`, React 18, TanStack Query v5, Vitest source-level tests.

---

### Task 1: Regression Tests

**Files:**
- Create: `src/test/orderAnalysisPostHogBehavior.test.ts`

- [ ] **Step 1: Add source-level tests for endpoint and UI wiring**

Create tests that read `server/index.js` and `src/pages/OrderAnalysis.tsx`, then assert the new route authenticates, resolves org, uses PostHog query env vars, filters by `properties.org_id`, returns `configured: false`, and the UI calls `/api/order-analysis/website-behavior` with `apiFetch()` and renders `Website Funnel`, `Conversion Drop-off`, and `Product Demand Signals`.

- [ ] **Step 2: Run failing test**

Run: `npm test -- src/test/orderAnalysisPostHogBehavior.test.ts`

Expected: FAIL because the endpoint and UI do not exist yet.

### Task 2: Backend Endpoint

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add PostHog query helpers near `/api/business-forecast`**

Add helpers to return an empty behavior payload, query PostHog HogQL via `/api/projects/:project_id/query/`, compute the biggest drop-off, and normalize query failures to empty data.

- [ ] **Step 2: Add `GET /api/order-analysis/website-behavior`**

Authenticate the user, resolve `orgId`, clamp `days` between 7 and 90, return `configured: false` if `POSTHOG_PERSONAL_API_KEY` or `POSTHOG_PROJECT_ID` is missing, otherwise query PostHog using `properties.org_id = orgId`.

### Task 3: Frontend Panel

**Files:**
- Modify: `src/pages/OrderAnalysis.tsx`

- [ ] **Step 1: Add response types and second query**

Add `WebsiteBehaviorResponse`, use `apiFetch('/api/order-analysis/website-behavior')`, and keep the same five-hour stale time.

- [ ] **Step 2: Render Option A panel placement**

Add `WebsiteBehaviorPanel` after the top forecast metric card section and before the existing sales calendar.

- [ ] **Step 3: Render empty, loading, funnel, drop-off, and demand states**

Show a friendly unconfigured message when `configured` is false, skeletons during load, and behavior metrics when data is present.

### Task 4: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add query env vars**

Document `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` alongside existing PostHog capture env vars.

### Task 5: Verification

**Files:**
- Verify only

- [ ] **Step 1: Run targeted tests**

Run: `npm test -- src/test/orderAnalysisPostHogBehavior.test.ts src/test/orderAnalysisRefresh.test.ts src/test/orderAnalysisExecutiveSummary.test.ts`

Expected: PASS.

- [ ] **Step 2: Run syntax/build checks**

Run: `node --check server/index.js` and `npm run build`.

Expected: both pass; existing Vite chunk-size warning is acceptable.

## Self-Review

- Spec coverage: endpoint, env vars, org filtering, configured-false behavior, Option A placement, and tests are covered.
- Placeholder scan: no placeholders remain.
- Type consistency: response names match the spec and UI component names.
