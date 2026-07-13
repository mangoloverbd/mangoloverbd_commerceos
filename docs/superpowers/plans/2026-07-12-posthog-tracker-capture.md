# PostHog Tracker Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forward existing custom website tracker pings to a SaaS-owned PostHog project without exposing PostHog credentials or breaking live visitor tracking.

**Architecture:** Keep `/api/live-visitor/ping` as the only merchant-site ingestion point. Add a server-side PostHog capture helper that is disabled when `POSTHOG_PROJECT_API_KEY` is missing and non-blocking when PostHog fails. Preserve Redis/memory live visitor behavior unchanged.

**Tech Stack:** Express.js in `server/index.js`, Node 20 built-in `fetch`, Vitest source-level regression tests.

---

### Task 1: Regression Test

**Files:**
- Modify: `src/test/liveVisitorTracking.test.ts`

- [ ] **Step 1: Add a failing PostHog capture regression test**

Add this test inside the existing `describe("live visitor tracking", () => { ... })` block:

```ts
  it("captures live visitor tracker events to PostHog server-side", () => {
    const pingStart = serverSource.indexOf('app.post("/api/live-visitor/ping"');
    const pingEnd = serverSource.indexOf('app.get("/api/live-visitors"', pingStart);
    const pingRoute = serverSource.slice(pingStart, pingEnd);

    expect(serverSource).toContain("async function capturePostHogEvent");
    expect(serverSource).toContain("POSTHOG_PROJECT_API_KEY");
    expect(serverSource).toContain("POSTHOG_HOST");
    expect(serverSource).toContain('event: "merchant_suite_live_visitor"');
    expect(serverSource).toContain('distinct_id: `${orgId}:${sessionId}`');
    expect(serverSource).toContain('source: "custom_website_tracker"');
    expect(serverSource).toContain('[PostHog] capture failed:');
    expect(pingRoute).toContain("referrer");
    expect(pingRoute).toContain("capturePostHogEvent");
    expect(pingRoute).not.toContain("await capturePostHogEvent");
  });
```

- [ ] **Step 2: Verify the test fails**

Run: `npm test -- src/test/liveVisitorTracking.test.ts`

Expected: FAIL because `capturePostHogEvent` does not exist yet.

### Task 2: Backend Capture Helper

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add helper near live visitor helper functions**

Add `capturePostHogEvent({ orgId, sessionId, url, referrer, bucket })` near the live visitor tracker helpers. It should read `POSTHOG_PROJECT_API_KEY`, default `POSTHOG_HOST` to `https://app.posthog.com`, POST to `/capture/`, include `event`, `api_key`, `distinct_id`, and `properties`, and catch/log failures without throwing.

- [ ] **Step 2: Hook helper into `/api/live-visitor/ping`**

Update the route destructuring to include `referrer`. After Redis/memory updates, call `void capturePostHogEvent({ orgId: org_id, sessionId: session_id, url, referrer, bucket: behaviorBucket });` before returning the response.

- [ ] **Step 3: Run test**

Run: `npm test -- src/test/liveVisitorTracking.test.ts`

Expected: PASS.

### Task 3: Env Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add PostHog env vars to the environment example**

Add these lines to the backend env block:

```env
POSTHOG_PROJECT_API_KEY=your_posthog_project_api_key
POSTHOG_HOST=https://app.posthog.com
```

- [ ] **Step 2: Explain backend-only PostHog usage**

Add one sentence after the env notes: `POSTHOG_PROJECT_API_KEY` is used only server-side to forward custom website tracker events into the SaaS-owned PostHog project; merchants do not need their own PostHog accounts.

### Task 4: Verification

**Files:**
- Verify only

- [ ] **Step 1: Run targeted test**

Run: `npm test -- src/test/liveVisitorTracking.test.ts`

Expected: PASS.

- [ ] **Step 2: Run server syntax check**

Run: `node --check server/index.js`

Expected: no output and exit code 0.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: Vite build succeeds.

## Self-Review

- Spec coverage: covers backend capture, env config, event contract, non-blocking failures, and tests.
- Placeholder scan: no open placeholders remain.
- Type consistency: helper parameters match route payload names and test assertions.
