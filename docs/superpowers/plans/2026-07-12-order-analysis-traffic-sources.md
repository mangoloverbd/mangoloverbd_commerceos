# Order Analysis Traffic Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Traffic Source Performance to Order Analysis using existing PostHog tracker events.

**Architecture:** Extend the existing `/api/order-analysis/website-behavior` response with `trafficSources`, derived from PostHog event `properties.referrer` and `properties.url` UTM parameters. Render a compact traffic card inside the existing `WebsiteBehaviorPanel` without adding a new endpoint.

**Tech Stack:** Express.js, PostHog HogQL, React 18, TanStack Query, Vitest source-level tests.

---

### Task 1: Regression Test

**Files:**
- Modify: `src/test/orderAnalysisPostHogBehavior.test.ts`

- [x] Add assertions that the server returns `trafficSources`, uses `referrer`, parses `utm_source`, and the page renders `Traffic Source Performance`.
- [x] Run `npm test -- src/test/orderAnalysisPostHogBehavior.test.ts` and confirm it fails for missing traffic source support.

### Task 2: Backend Aggregation

**Files:**
- Modify: `server/index.js`

- [x] Add `trafficSources: []` to `emptyWebsiteBehaviorPayload()`.
- [x] Extend the PostHog query batch with a grouped traffic query.
- [x] Derive source using UTM first, then referrer host, then `Direct`.
- [x] Return rows with `source`, `visitors`, `carts`, `purchases`, and `conversionRate`.

### Task 3: Frontend Card

**Files:**
- Modify: `src/pages/OrderAnalysis.tsx`

- [x] Add `trafficSources` to `WebsiteBehaviorResponse`.
- [x] Add a `Traffic Source Performance` card below Product Demand Signals in `WebsiteBehaviorPanel`.
- [x] Show an empty state when no sources exist.

### Task 4: Verification

**Files:**
- Verify only

- [x] Run `npm test -- src/test/orderAnalysisPostHogBehavior.test.ts src/test/liveVisitorTracking.test.ts`.
- [x] Run `node --check server/index.js`.
- [x] Run `npm run build`.

## Self-Review

- Scope is limited to traffic source performance.
- No new endpoint, schema, or env vars required.
- Tenant isolation remains inherited from the existing `properties.org_id = {orgId}` query filter.
