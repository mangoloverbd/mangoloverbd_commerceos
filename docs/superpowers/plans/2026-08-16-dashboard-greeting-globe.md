# Dashboard Greeting Band + Live-Visitors Globe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a borderless greeting band between the P&L panel and Fulfillment Queue on the Dashboard — time-aware greeting centered, cobe globe with real live-visitor count on the right — and remove the old "Welcome back, {orgName}" heading.

**Architecture:** Three new units (`src/lib/greeting.ts` pure helper, `src/hooks/useLiveVisitors.ts` shared poll hook, `src/components/ui/cobe-globe-analytics.tsx` presentational globe) composed in `src/pages/Dashboard.tsx`. The existing `LiveVisitorsCounter` chip is refactored from self-fetching to props-driven so one poll feeds both the header chip and the globe caption.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Tailwind, Framer Motion, Vitest + @testing-library/react (jsdom, globals, `@` alias → `src/`), cobe (new dependency).

**Spec:** `docs/superpowers/specs/2026-08-16-dashboard-greeting-globe-design.md`

## Global Constraints

- All frontend API calls use `apiFetch()` from `src/lib/api.ts` — never raw `fetch()`.
- TypeScript strict: no `any` unless documented with a comment.
- No new font imports; Geist is loaded globally. Currency symbol `৳` if amounts appear (none in this feature).
- Borderless design language: no card shadows or borders on the greeting band.
- Phosphor icons `weight="light"` if icons are added (this feature needs none).
- Tests live in `src/test/` (`*.test.ts|tsx`); test command is `npm test` (vitest run).
- Two existing source-scanning tests read `src/pages/Dashboard.tsx` (`dashboardFinanceMetricAnimation.test.ts`, `liveVisitorTracking.test.ts`) — Task 4 updates the latter deliberately; do not alter the `FinanceMetric` component body or the `grid grid-cols-2 lg:grid-cols-5 gap-3` metrics class.
- No backend changes, no `org_id`-scoped query changes.

---

### Task 1: Dhaka-time greeting helper (TDD)

**Files:**
- Create: `src/lib/greeting.ts`
- Test: `src/test/greeting.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `getDhakaGreeting(now?: Date): string` — returns `"Good morning"` (Dhaka 04:00–11:59), `"Good afternoon"` (12:00–16:59), or `"Good evening"` (17:00–03:59). Also exports `dhakaHour(now?: Date): number` (UTC+6 hour).

- [ ] **Step 1: Write the failing test**

Create `src/test/greeting.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getDhakaGreeting } from "@/lib/greeting";

/** Returns a Date whose Dhaka (UTC+6) wall-clock time equals hour:minute. */
function dhakaTime(hour: number, minute = 0): Date {
  // Date.UTC rolls negative hours back to the previous day automatically.
  return new Date(Date.UTC(2026, 7, 15, hour - 6, minute, 0));
}

describe("getDhakaGreeting", () => {
  it("says Good morning from 04:00 to 11:59 Dhaka time", () => {
    expect(getDhakaGreeting(dhakaTime(4, 0))).toBe("Good morning");
    expect(getDhakaGreeting(dhakaTime(11, 59))).toBe("Good morning");
  });

  it("says Good afternoon from 12:00 to 16:59 Dhaka time", () => {
    expect(getDhakaGreeting(dhakaTime(12, 0))).toBe("Good afternoon");
    expect(getDhakaGreeting(dhakaTime(16, 59))).toBe("Good afternoon");
  });

  it("says Good evening from 17:00 through 03:59 Dhaka time (no Good night)", () => {
    expect(getDhakaGreeting(dhakaTime(17, 0))).toBe("Good evening");
    expect(getDhakaGreeting(dhakaTime(23, 30))).toBe("Good evening");
    expect(getDhakaGreeting(dhakaTime(0, 0))).toBe("Good evening");
    expect(getDhakaGreeting(dhakaTime(3, 59))).toBe("Good evening");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/greeting.test.ts`
Expected: FAIL — cannot resolve `@/lib/greeting` (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/greeting.ts`:

```ts
/**
 * Time-of-day greetings computed in Dhaka time (UTC+6), matching the
 * dashboard's existing `dhakaToday()` convention (no timezone library).
 * There is deliberately no "Good night" — merchants working late hours
 * still get "Good evening".
 */

export function dhakaHour(now: Date = new Date()): number {
  return new Date(now.getTime() + 6 * 60 * 60 * 1000).getUTCHours();
}

export function getDhakaGreeting(now: Date = new Date()): string {
  const hour = dhakaHour(now);
  if (hour >= 4 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/greeting.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/greeting.ts src/test/greeting.test.ts
git commit -m "feat: add Dhaka-time greeting helper with boundary tests"
```

---

### Task 2: `useLiveVisitors` shared polling hook (TDD)

**Files:**
- Create: `src/hooks/useLiveVisitors.ts`
- Test: `src/test/useLiveVisitors.test.ts`

**Interfaces:**
- Consumes: `apiFetch(url: string, options?: RequestInit): Promise<Response>` from `src/lib/api.ts`
- Produces:
  ```ts
  interface LiveVisitorDetails { activeCarts: number; checkingOut: number; purchased: number }
  interface LiveVisitorsState { count: number; details: LiveVisitorDetails; loaded: boolean }
  function useLiveVisitors(pollMs?: number): LiveVisitorsState  // pollMs defaults to 5000
  ```

- [ ] **Step 1: Write the failing test**

Create `src/test/useLiveVisitors.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { useLiveVisitors } from "@/hooks/useLiveVisitors";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe("useLiveVisitors", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns count and behavior details from the API", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse({ count: 7, details: { activeCarts: 2, checkingOut: 1, purchased: 3 } }),
    );

    const { result } = renderHook(() => useLiveVisitors());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.count).toBe(7);
    expect(result.current.details).toEqual({ activeCarts: 2, checkingOut: 1, purchased: 3 });
  });

  it("keeps zeros and still reports loaded when the request fails", async () => {
    mockApiFetch.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useLiveVisitors());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.count).toBe(0);
    expect(result.current.details).toEqual({ activeCarts: 0, checkingOut: 0, purchased: 0 });
  });

  it("polls every 5 seconds and clears the interval on unmount", () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ count: 0, details: {} }));
    const intervalSpy = vi.spyOn(window, "setInterval");
    const clearSpy = vi.spyOn(window, "clearInterval");

    const { unmount } = renderHook(() => useLiveVisitors());
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 5000);

    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/useLiveVisitors.test.ts`
Expected: FAIL — cannot resolve `@/hooks/useLiveVisitors`.

- [ ] **Step 3: Write minimal implementation**

Create `src/hooks/useLiveVisitors.ts`:

```ts
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface LiveVisitorDetails {
  activeCarts: number;
  checkingOut: number;
  purchased: number;
}

export interface LiveVisitorsState {
  count: number;
  details: LiveVisitorDetails;
  loaded: boolean;
}

const EMPTY_DETAILS: LiveVisitorDetails = {
  activeCarts: 0,
  checkingOut: 0,
  purchased: 0,
};

/**
 * Polls GET /api/live-visitors every `pollMs` and returns the latest
 * count + behavior details. Failure-tolerant: errors keep the previous
 * values (zeros initially) and never surface to the UI.
 */
export function useLiveVisitors(pollMs = 5000): LiveVisitorsState {
  const [count, setCount] = useState(0);
  const [details, setDetails] = useState<LiveVisitorDetails>(EMPTY_DETAILS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchCount = async () => {
      try {
        const res = await apiFetch("/api/live-visitors", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setCount(Number(data.count) || 0);
          setDetails({
            activeCarts: Number(data.details?.activeCarts) || 0,
            checkingOut: Number(data.details?.checkingOut) || 0,
            purchased: Number(data.details?.purchased) || 0,
          });
        }
      } catch {
        // Non-critical dashboard signal — keep previous values.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    fetchCount();
    const intervalId = window.setInterval(fetchCount, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [pollMs]);

  return { count, details, loaded };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/useLiveVisitors.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useLiveVisitors.ts src/test/useLiveVisitors.test.ts
git commit -m "feat: add useLiveVisitors shared polling hook"
```

---

### Task 3: `GlobeAnalytics` cobe component

**Files:**
- Create: `src/components/ui/cobe-globe-analytics.tsx`
- Modify: `package.json` / `package-lock.json` (new dependency `cobe`)

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: `GlobeAnalytics({ markers?, className?, speed? }: GlobeAnalyticsProps)` — presentational rotating globe; `markers` defaults to the 6 decorative city markers, `speed` defaults to `0.003`. Canvas fills its container width (aspect-square).

Notes:
- This is a canvas/WebGL component — jsdom cannot render it, so there is no unit test; verification is `lint` + `build` (TypeScript). Manual QA happens in Task 5.
- Compared to the original provided snippet, the dead floating-label overlay and its random-walk `data` state are removed (they depended on CSS anchor-positioning variables that nothing ever sets and could never render), and `React.PointerEvent` is imported explicitly as a type so strict TS compiles without a `React` namespace import.

- [ ] **Step 1: Install dependency**

Run: `npm install cobe`
Expected: `added N packages` — `cobe` appears in `package.json` dependencies.

- [ ] **Step 2: Create the component**

Create `src/components/ui/cobe-globe-analytics.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import createGlobe from "cobe";

interface AnalyticsMarker {
  id: string;
  location: [number, number];
  visitors: number;
  trend: number;
}

interface GlobeAnalyticsProps {
  markers?: AnalyticsMarker[];
  className?: string;
  speed?: number;
}

// Decorative markers — the live-visitor API provides no geography, so
// locations are illustrative. The real total is shown in the caption
// rendered by the consumer (Dashboard).
const defaultMarkers: AnalyticsMarker[] = [
  { id: "vis-1", location: [40.71, -74.01], visitors: 847, trend: 12 },
  { id: "vis-2", location: [51.51, -0.13], visitors: 623, trend: -3 },
  { id: "vis-3", location: [35.68, 139.65], visitors: 412, trend: 8 },
  { id: "vis-4", location: [48.86, 2.35], visitors: 385, trend: 5 },
  { id: "vis-5", location: [-33.87, 151.21], visitors: 201, trend: 15 },
  { id: "vis-6", location: [52.52, 13.41], visitors: 178, trend: -1 },
];

export function GlobeAnalytics({
  markers: initialMarkers = defaultMarkers,
  className = "",
  speed = 0.003,
}: GlobeAnalyticsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ phi: 0, theta: 0 });
  const phiOffsetRef = useRef(0);
  const thetaOffsetRef = useRef(0);
  const isPausedRef = useRef(false);

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    pointerInteracting.current = { x: e.clientX, y: e.clientY };
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    isPausedRef.current = true;
  }, []);

  const handlePointerUp = useCallback(() => {
    if (pointerInteracting.current !== null) {
      phiOffsetRef.current += dragOffset.current.phi;
      thetaOffsetRef.current += dragOffset.current.theta;
      dragOffset.current = { phi: 0, theta: 0 };
    }
    pointerInteracting.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
    isPausedRef.current = false;
  }, []);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (pointerInteracting.current !== null) {
        dragOffset.current = {
          phi: (e.clientX - pointerInteracting.current.x) / 300,
          theta: (e.clientY - pointerInteracting.current.y) / 1000,
        };
      }
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerUp]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    let globe: ReturnType<typeof createGlobe> | null = null;
    let animationId: number;
    let phi = 0;

    function init() {
      const width = canvas.offsetWidth;
      if (width === 0 || globe) return;

      globe = createGlobe(canvas, {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width,
        height: width,
        phi: 0,
        theta: 0.2,
        dark: 0,
        diffuse: 1.5,
        mapSamples: 16000,
        mapBrightness: 10,
        baseColor: [1, 1, 1],
        markerColor: [0.3, 0.85, 0.45],
        glowColor: [0.94, 0.93, 0.91],
        markerElevation: 0,
        markers: initialMarkers.map((m) => ({ location: m.location, size: 0.04, id: m.id })),
        arcs: [],
        arcColor: [0.25, 0.9, 0.5],
        arcWidth: 0.5,
        arcHeight: 0.25,
        opacity: 0.7,
      });

      function animate() {
        if (!isPausedRef.current) phi += speed;
        globe!.update({
          phi: phi + phiOffsetRef.current + dragOffset.current.phi,
          theta: 0.2 + thetaOffsetRef.current + dragOffset.current.theta,
        });
        animationId = requestAnimationFrame(animate);
      }
      animate();
      setTimeout(() => {
        canvas.style.opacity = "1";
      });
    }

    if (canvas.offsetWidth > 0) {
      init();
    } else {
      const ro = new ResizeObserver((entries) => {
        if (entries[0]?.contentRect.width > 0) {
          ro.disconnect();
          init();
        }
      });
      ro.observe(canvas);
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (globe) globe.destroy();
    };
  }, [initialMarkers, speed]);

  return (
    <div className={`relative aspect-square select-none ${className}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        style={{
          width: "100%",
          height: "100%",
          cursor: "grab",
          opacity: 0,
          transition: "opacity 1.2s ease",
          borderRadius: "50%",
          touchAction: "none",
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify type-check and lint**

Run: `npm run build`
Expected: build succeeds (TypeScript compiles the new component).
Run: `npx eslint src/components/ui/cobe-globe-analytics.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/ui/cobe-globe-analytics.tsx
git commit -m "feat: add cobe globe analytics component"
```

---

### Task 4: Dashboard integration — greeting band, globe caption, header refactor

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/test/liveVisitorTracking.test.ts` (one test — see rationale below)

**Interfaces:**
- Consumes: `getDhakaGreeting` (Task 1), `useLiveVisitors` + `LiveVisitorsState` (Task 2), `GlobeAnalytics` (Task 3), existing `cn` from `@/lib/utils`, existing `motion` from `framer-motion`.
- Produces: updated Dashboard page; `LiveVisitorsCounter` now takes `{ count, details, loaded }` props.

**Why the test change:** `liveVisitorTracking.test.ts` source-scans `Dashboard.tsx` and asserts the literal string `/api/live-visitors` and the exact prop-less markup `<LiveVisitorsCounter />` live in that file. Moving the fetch into the Task 2 hook and passing props would fail those two assertions even though behavior is preserved and improved (single shared poll). The test is updated to preserve its intent — a live-visitors counter renders left of the date picker, and the endpoint is polled — while pointing the endpoint assertion at the hook file.

- [ ] **Step 1: Update the source-scanning regression test (stays green before and after the refactor)**

In `src/test/liveVisitorTracking.test.ts`, replace the entire test block named `"renders a live visitors counter left of the date picker"` with:

```ts
  it("renders a live visitors counter left of the date picker", () => {
    const hookSource = readFileSync(resolve(process.cwd(), "src/hooks/useLiveVisitors.ts"), "utf8");
    const headerStart = dashboardSource.indexOf("<LiveVisitorsCounter");
    const pickerStart = dashboardSource.indexOf("<DateRangePicker", headerStart);

    expect(dashboardSource).toContain("function LiveVisitorsCounter");
    expect(hookSource).toContain("/api/live-visitors");
    expect(hookSource).toContain("setInterval");
    expect(dashboardSource).toContain("Visitors right now");
    expect(dashboardSource).toContain("Customer behavior");
    expect(dashboardSource).toContain("Active carts");
    expect(dashboardSource).toContain("Checking out");
    expect(dashboardSource).toContain("Purchased");
    expect(headerStart).toBeGreaterThan(-1);
    expect(pickerStart).toBeGreaterThan(headerStart);
  });
```

Run: `npx vitest run src/test/liveVisitorTracking.test.ts`
Expected: PASS (the hook file already exists from Task 2; all other assertions still hold).

- [ ] **Step 2: Refactor `LiveVisitorsCounter` to props-driven**

In `src/pages/Dashboard.tsx`, replace the whole existing `LiveVisitorsCounter` function (currently lines ~188–265, containing its own `useState`/`useEffect` fetch loop) with:

```tsx
function LiveVisitorsCounter({
  count,
  details,
  loaded,
}: {
  count: number;
  details: { activeCarts: number; checkingOut: number; purchased: number };
  loaded: boolean;
}) {
  if (!loaded) return null;

  const behaviorRows = [
    { label: "Active carts", value: details.activeCarts },
    { label: "Checking out", value: details.checkingOut },
    { label: "Purchased", value: details.purchased },
  ];

  return (
    <div className="group relative">
      <div className="flex h-8 cursor-default items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[11px] font-medium text-foreground/70 tabular-nums">
        <span className="relative flex h-2 w-2">
          {count > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />}
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", count > 0 ? "bg-emerald-500" : "bg-black/20")} />
        </span>
        {count} online
      </div>

      <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-56 translate-y-1 rounded-xl border border-black/[0.08] bg-white p-4 opacity-0 shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-all duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/35">Visitors right now</p>
            <p className="mt-1 text-2xl font-light leading-none text-black tabular-nums">{count}</p>
          </div>
          <span className={cn("mt-1 h-2 w-2 rounded-full", count > 0 ? "bg-emerald-500" : "bg-black/15")} />
        </div>

        <div className="mt-4 border-t border-black/[0.06] pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/30">Customer behavior</p>
          <div className="space-y-2">
            {behaviorRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-black/50">{row.label}</span>
                <span className="font-medium text-black tabular-nums">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewire the `Dashboard` component**

In `src/pages/Dashboard.tsx`:

3a. Imports — delete the line:

```tsx
import { useOrgName } from "@/hooks/useOrgName";
```

and add these three imports with the other imports at the top:

```tsx
import { useLiveVisitors } from "@/hooks/useLiveVisitors";
import { getDhakaGreeting } from "@/lib/greeting";
import { GlobeAnalytics } from "@/components/ui/cobe-globe-analytics";
```

3b. Inside `export default function Dashboard()`, replace the line:

```tsx
  const { orgName } = useOrgName();
```

with:

```tsx
  const liveVisitors = useLiveVisitors();
```

3c. P&L header — replace:

```tsx
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[22px] font-bold text-black tracking-tight">
              Welcome back, {orgName || "there"}
            </h2>
            <div className="flex items-center gap-2">
```

with:

```tsx
          <div className="flex items-center justify-end mb-3">
            <div className="flex items-center gap-2">
```

(Leave the controls and both closing `</div>` tags that follow untouched.)

3d. Replace the usage:

```tsx
            <LiveVisitorsCounter />
```

with:

```tsx
            <LiveVisitorsCounter count={liveVisitors.count} details={liveVisitors.details} loaded={liveVisitors.loaded} />
```

- [ ] **Step 4: Insert the greeting band**

In `src/pages/Dashboard.tsx`, between the closing `</motion.div>` of the P&L panel and the opening `<motion.div>` of the Orders table card (the comment `{/* ── Orders table card ──...`), insert:

```tsx
      {/* ── Greeting band ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.4 }}
        className="grid items-center md:grid-cols-[1fr_auto_1fr]"
      >
        <div className="hidden md:block" />
        <div className="text-center">
          <h2 className="text-3xl font-light text-black">{getDhakaGreeting()}!</h2>
          <p className="mt-1.5 text-[13px] font-light text-black/45">
            Let&apos;s continue growing your business.
          </p>
        </div>
        <div className="hidden md:flex flex-col items-center justify-self-end">
          <GlobeAnalytics className="w-[220px]" />
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-foreground/60 tabular-nums">
            <span className="relative flex h-2 w-2">
              {liveVisitors.count > 0 && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              )}
              <span
                className={cn(
                  "relative inline-flex h-2 w-2 rounded-full",
                  liveVisitors.count > 0 ? "bg-emerald-500" : "bg-black/20",
                )}
              />
            </span>
            {liveVisitors.count} visiting now
          </div>
        </div>
      </motion.div>
```

- [ ] **Step 5: Run the affected tests**

Run: `npx vitest run src/test/liveVisitorTracking.test.ts src/test/dashboardFinanceMetricAnimation.test.ts src/test/dashboardLayoutBreadcrumb.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Dashboard.tsx src/test/liveVisitorTracking.test.ts
git commit -m "feat: dashboard greeting band with live-visitors globe"
```

---

### Task 5: Full verification gate

**Files:** none new (fix-forward only)

**Interfaces:**
- Consumes: all previous tasks
- Produces: a green full-suite run + manual QA sign-off

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass (no regressions beyond the tasks' new tests).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors (pre-existing warnings, if any, unchanged).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual QA (run the app with `npm run dev`, log in, open `/`)**

Checklist:
- Greeting band renders between the P&L panel and the Fulfillment Queue; the queue is visibly lower than before.
- Greeting text matches the current Dhaka time of day; subtitle reads "Let's continue growing your business."
- The old "Welcome back, {orgName}" heading is gone; P&L header controls (FB-ads link / live chip / date picker / refresh) are right-aligned and functional.
- Globe spins, fades in (~1.2s), and responds to click-drag; on `md+` screens only.
- Caption under the globe shows the same number as the header "online" chip; both update on the 5s poll.
- Resize below `md`: globe + caption hidden, greeting stays centered.

- [ ] **Step 5: Fix-forward commit (only if any step above required changes)**

```bash
git add -A
git commit -m "fix: address verification findings for greeting band"
```
