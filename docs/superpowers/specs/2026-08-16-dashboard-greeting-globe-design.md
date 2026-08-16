# Dashboard Greeting Band + Live-Visitors Globe — Design

- **Date:** 2026-08-16
- **Status:** Approved (brainstorming gate passed)
- **Scope:** Dashboard page only (`/` → `src/pages/Dashboard.tsx`)
- **Out of scope:** the Composio Facebook/Instagram connect feature (tracked in `handoff.md`), any backend changes to `/api/live-visitors`, geo-tracking of real visitors.

## 1. Overview

Insert a new borderless "greeting band" section on the Dashboard, positioned in normal document flow **between the P&L panel and the Fulfillment Queue card** (which therefore moves down with no other change to it). The band contains:

1. A **time-aware greeting** ("Good morning/afternoon/evening!") with the subtitle "Let's continue growing your business.", centered on the page.
2. A **rotating cobe globe** (provided component) on the right side, with a **real live-visitor total** caption beneath it. Marker locations remain decorative.

Additionally, the P&L panel's `Welcome back, {orgName}` heading is removed; the P&L header row keeps its controls only, right-aligned.

## 2. Layout

DOM order on the Dashboard: `P&L panel` → `Greeting band` → `Fulfillment Queue card`.

Band structure (desktop, `md` and up):

```
grid grid-cols-[1fr_auto_1fr]  (items-center)
┌───────────────┬─────────────────────────────┬──────────────────┐
│  empty spacer │  greeting (center column)   │  globe + caption │
└───────────────┴─────────────────────────────┴──────────────────┘
```

- The empty left cell guarantees the greeting sits at the **true horizontal center of the page**, not centered within leftover space.
- Globe column is ~240px wide total (globe ~220px + caption).
- **Below `md`:** the globe column is hidden (`hidden md:block` on the globe wrapper); the greeting stays centered. The grid collapses to a single centered column.
- Band is borderless, no shadow, no background — page background `bg-[#FAFAF8]` shows through.
- Entry animation: Framer Motion fade-up, delay between the P&L panel (0s) and the queue (0.1s), e.g. `delay: 0.05, duration: 0.4`, matching existing `motion.div` patterns on the page.

## 3. Greeting

Pure helper, colocated for testability:

```ts
// src/lib/greeting.ts
getDhakaGreeting(now?: Date): string
```

The helper lives in `src/lib/greeting.ts` (not inside the page component) so it can be unit-tested without rendering the Dashboard.

- Uses the same UTC+6 approach as the existing `dhakaToday()` helper (no new date library).
- Buckets by Dhaka local hour:
  - `04:00–11:59` → "Good morning"
  - `12:00–16:59` → "Good afternoon"
  - `17:00–03:59` → "Good evening"
- No "Good night" variant — late-working merchants still get "Good evening".
- Rendered with the exclamation mark: "Good evening!".

Typography (per design language):

- Greeting: `text-3xl font-light text-black`
- Subtitle: `text-[13px] text-black/45 font-light` — "Let's continue growing your business."
- No org name anywhere in the band (explicit decision). The `useOrgName()` usage and its import are removed from `Dashboard.tsx` since the `Welcome back` heading is deleted.

## 4. Globe & live data

### Component

- Install dependency: `npm install cobe`.
- New file `src/components/ui/cobe-globe-analytics.tsx` — the provided `GlobeAnalytics` component with one cleanup:
  - **Remove** the floating per-marker count labels and the `data` random-walk state/interval. Rationale: the labels are driven by CSS anchor-positioning (`positionAnchor`, `anchor(top)`, `--cobe-visible-*` vars) that nothing in the component ever defines, so they can never render visibly — dead DOM.
  - **Keep** everything else: canvas init, rotation speed prop, drag-to-spin pointer handlers, `ResizeObserver` deferred init for zero-width mounts, unmount cleanup (`cancelAnimationFrame` + `globe.destroy()`), `devicePixelRatio` cap at 2.
  - Default props unchanged: 6 decorative city markers, `speed = 0.003`.

### Data flow

- New hook `src/hooks/useLiveVisitors.ts`:
  - Polls `GET /api/live-visitors` via `apiFetch()` every 5 seconds (same cadence/contract as today's inline implementation), returns `{ count, details, loaded }`.
  - Failure-tolerant: on error, keeps last-known values (or 0 initially); never throws to UI.
- `Dashboard.tsx` calls `useLiveVisitors()` **once** and passes results down as props to:
  1. `LiveVisitorsCounter` (refactored from self-fetching to props-driven; visuals unchanged), and
  2. the new globe caption.
- Globe caption (under the globe, right-aligned with it):
  - Pulsing emerald dot when `count > 0` (same pattern as the existing chip), grey dot at 0.
  - Text: `{count} visiting now` in `text-[11px] text-foreground/60 tabular-nums`.

### P&L header changes

- Delete the `<h2>Welcome back, {orgName}</h2>`.
- Keep the controls row: Connect-Facebook-Ads link (when unconfigured), `fbError` span, `LiveVisitorsCounter` chip, `DateRangePicker`, refresh button — now right-aligned (`justify-end`), same `mb-3` spacing.
- The non-admin blur overlay logic stays as-is (it wraps the metrics area, unaffected).

## 5. Files touched

| File | Change |
|---|---|
| `src/components/ui/cobe-globe-analytics.tsx` | **NEW** — provided globe component, minus dead label overlay |
| `src/lib/greeting.ts` | **NEW** — `getDhakaGreeting()` pure helper |
| `src/hooks/useLiveVisitors.ts` | **NEW** — shared 5s poll hook |
| `src/pages/Dashboard.tsx` | Remove org-name heading + `useOrgName`; refactor `LiveVisitorsCounter` to props; add greeting band; use shared hook |
| `package.json` / lockfile | `cobe` dependency |
| `src/test/` | **NEW** — `getDhakaGreeting` boundary tests |

No backend changes. No new API endpoints. No `org_id`-scoped queries touched.

## 6. Edge cases & error handling

- `/api/live-visitors` down or slow → caption shows `0 visiting now` with grey dot (same degradation as today's chip).
- Canvas mounts at width 0 (e.g., hidden container) → existing `ResizeObserver` path initializes once width > 0.
- Component unmount (route change) → animation frame cancelled, globe destroyed (already in provided component).
- Greeting computed at render time from current Dhaka date; a session open across a bucket boundary updates on next render — acceptable, no timer required.

## 7. Testing & verification

- Unit tests for `getDhakaGreeting()` boundaries: 03:59 → evening, 04:00 → morning, 11:59 → morning, 12:00 → afternoon, 16:59 → afternoon, 17:00 → evening.
- `npm test`, `npm run lint`, `npm run build` must pass (verification-before-completion gate).
- Manual QA: band renders between P&L and queue; globe spins and responds to drag; caption reflects the same count as the header chip; mobile hides globe.

## 8. Design-language compliance

- Borderless panel, no shadows — consistent with luxury-minimalist language.
- Geist only, no new font imports; `৳` unaffected (no currency in this band).
- No new icons required (status dot is a styled span). If any icon is ever added, Phosphor `weight="light"`.
