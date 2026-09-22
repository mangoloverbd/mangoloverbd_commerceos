# Order Activity Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace empty ownership/review metadata with useful latest-activity and history summaries, styled with restrained semantic BoardUI chips.

**Architecture:** Derive all new overview values inside `OrderActivityTimeline` from its existing event and provenance response. Reuse the project BoardUI `Chip` and existing activity color mapping; no backend or schema change is needed.

**Tech Stack:** React 18, TypeScript, TanStack Query, BoardUI Chip, Vitest, Testing Library.

## Global Constraints

- Preserve the compact five-event default and full-history toggle.
- Preserve whole-row expansion for reason, exact timestamp, and before/after values.
- Never display empty ownership placeholders or a context-free viewer count.
- Use colorful chips only for semantic labels, not actor names, timestamps, or change values.

---

### Task 1: Replace provenance metadata with audit overview

**Files:**
- Modify: `src/components/OrderActivityTimeline.tsx`
- Modify: `src/test/orderActivityTimeline.test.tsx`
- Potentially update through CLI: `src/components/base/badges/chip.tsx`

**Interfaces:**
- Consumes: existing `Response.events`, `Response.provenance`, `activityActionColor(action)` and BoardUI `Chip`.
- Produces: an Origin chip, latest-event chip and copy, and a History count chip with tracking start date.

- [x] **Step 1: Run the requested BoardUI installer**

Run: `npx boardui@latest add chip`

Expected: the project-local chip component is installed or confirmed. Review any CLI changes before keeping them.

- [x] **Step 2: Write failing overview tests**

Extend the fixture with provenance and assert:

```tsx
expect(await screen.findByText("Latest activity")).toBeInTheDocument();
expect(screen.getByText("History")).toBeInTheDocument();
expect(screen.getByText("Website")).toBeInTheDocument();
expect(screen.getByText("1 event")).toBeInTheDocument();
expect(screen.queryByText("Ownership")).not.toBeInTheDocument();
expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
```

- [x] **Step 3: Run the focused test and confirm it fails**

Run: `npx vitest run src/test/orderActivityTimeline.test.tsx`

Expected: FAIL because Latest activity and History are not rendered yet.

- [x] **Step 4: Implement the overview and semantic chips**

Import `Chip`, `activityActionColor`, and `ActivityAction`. Derive the latest event from `events[0]`, the oldest event from `events[events.length - 1]`, and render:

```tsx
<Chip variant="caption" color="cyan">{humanize(provenance.origin_source)}</Chip>
<Chip variant="caption" color={eventColor(latestEvent)}>{latestEvent.summary}</Chip>
<Chip variant="caption" color="purple">{events.length} event{events.length === 1 ? "" : "s"}</Chip>
```

Keep actors and relative timestamps as adjacent text. Remove Ownership and Reviewed. Use a safe event-action parser so unknown detailed event types fall back to `soft` rather than being cast blindly.

- [x] **Step 5: Run focused and full verification**

Run:

```bash
npx vitest run src/test/orderActivityTimeline.test.tsx
npm test
npm run build
npm run lint
```

Expected: tests and build pass; lint has no errors.

- [x] **Step 6: Commit**

```bash
git add src/components/OrderActivityTimeline.tsx src/test/orderActivityTimeline.test.tsx src/components/base/badges/chip.tsx
git commit -m "feat: improve order activity overview"
```
