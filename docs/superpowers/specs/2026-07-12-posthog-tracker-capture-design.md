# PostHog Tracker Capture Design

## Scope

Implement phase 1 of the SaaS-owned PostHog analytics pipeline: backend-only capture from the existing Merchant-Suite custom website tracker into one PostHog project.

This phase does not add dashboard query endpoints, PostHog widgets, merchant-owned PostHog accounts, or changes to the merchant embed script.

## Goals

- Keep merchant websites integrated through the existing `/api/tracker.js?org=...` script.
- Forward existing tracker pings from `/api/live-visitor/ping` to PostHog server-side.
- Include `org_id` on every captured event so all future analytics can be filtered by tenant.
- Keep PostHog failures non-blocking so live visitor tracking continues to work if PostHog is unavailable or not configured.
- Avoid exposing PostHog project credentials to merchant websites.

## Configuration

Add backend environment variables:

- `POSTHOG_PROJECT_API_KEY`: PostHog project API key used for event capture.
- `POSTHOG_HOST`: optional PostHog host, defaulting to `https://app.posthog.com`.

No frontend `VITE_` variables are required.

## Backend Design

Add a helper in `server/index.js` near the live visitor tracker code:

- `capturePostHogEvent({ orgId, sessionId, url, referrer, bucket })`
- Return immediately when `POSTHOG_PROJECT_API_KEY` is missing.
- Send a `POST` request to `${POSTHOG_HOST}/capture/`.
- Log a warning if capture fails, but do not throw to the route handler.

The existing `POST /api/live-visitor/ping` route remains the ingestion point. After validating the public tracker payload and updating Redis/memory live visitor presence, call the PostHog helper in fire-and-forget style.

## Event Contract

Event name:

```text
merchant_suite_live_visitor
```

Distinct ID:

```text
${org_id}:${session_id}
```

Properties:

- `org_id`
- `session_id`
- `url`
- `referrer`
- `bucket`
- `source: "custom_website_tracker"`

The tenant-scoped distinct ID prevents one merchant's browser session ID from colliding with another merchant's data in the shared PostHog project.

## Error Handling

- Invalid tracker payloads still return `400` before any Redis or PostHog work.
- Missing PostHog config silently disables PostHog capture.
- PostHog network/API failures log `[PostHog] capture failed:` and do not affect the `/api/live-visitor/ping` response.
- Existing Redis/memory behavior remains unchanged.

## Tests

Extend `src/test/liveVisitorTracking.test.ts` with source-level regression assertions for:

- PostHog capture helper exists.
- `POSTHOG_PROJECT_API_KEY` and `POSTHOG_HOST` are used server-side.
- `/api/live-visitor/ping` invokes PostHog capture.
- Captured events include `org_id` and `source: "custom_website_tracker"`.
- `distinct_id` is scoped as `${orgId}:${sessionId}`.
- PostHog errors are logged and non-blocking.

Verification commands:

```bash
npm test -- src/test/liveVisitorTracking.test.ts
node --check server/index.js
npm run build
```
