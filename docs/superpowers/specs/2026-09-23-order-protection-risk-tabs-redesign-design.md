# Order Protection Risk Tabs Redesign

**Date:** 2026-09-23  
**Status:** Approved for implementation  
**Scope:** `feat/order-risk-engine-v2`

## Goal

Redesign the Order Protection **Attempts**, **Lists**, **Accuracy**, and **Settings** tabs so they use the same report-oriented visual language as Staff Performance and Business Report pages. Keep the existing risk APIs, data contracts, and actions. Keep the Reviews tab and its held-order review queue unchanged.

## Non-goals

- Do not change risk scoring, decisions, lists, accuracy calculations, or settings persistence.
- Do not change backend routes or Supabase queries.
- Do not redesign or remove the Reviews tab.
- Do not add a new route or navigation entry.
- Do not expose hashed identifiers or other server-only risk fields.

## Existing architecture

`src/pages/OrderProtection.tsx` owns the tab state and renders one of:

- `OrderProtectionReviewQueue` for Reviews
- `RiskAttemptsPanel` for Attempts
- `RiskListsPanel` for Lists
- `RiskAccuracyPanel` for Accuracy
- `RiskSettingsPanel` for Settings

The panels are currently defined in `src/components/risk/RiskDashboard.tsx` and call the existing typed wrappers in `src/lib/orderRisk.ts`. The redesign will remain inline in the existing component file; no new page or API module is needed.

## Shared visual system

Use the established report-page conventions already present in `StaffPerformance.tsx` and `BusinessReport.tsx`:

- Warm page background: `bg-[#FAFAF8]`
- Rounded report surfaces: `rounded-2xl`
- Light neutral surfaces: `bg-black/[0.04]`, with white detail surfaces where needed
- Small uppercase labels with wide tracking (`text-[8px]`, `tracking-[0.3em]`)
- Light, tabular numeric values
- Compact controls with visible focus states
- Framer Motion for panel/card transitions, respecting `useReducedMotion`
- Responsive layouts that collapse cleanly on small screens
- Semantic headings, labels, `role="tab"`/`aria-selected`, `aria-expanded`, and live status/error messaging

Do not introduce new design tokens or a competing color system.

## Panel designs

### Attempts

Keep the existing decision filter, pagination, detail fetch, labeling, and blocking actions. Recompose the loaded data into report-style content:

1. A compact panel header with the current decision filter, loaded-attempt count, and the existing older-attempts control.
2. Summary cards derived from the currently loaded page: loaded attempts, held, blocked, and average score. The cards must be explicitly scoped to the loaded results so they are not mistaken for a full historical total.
3. Attempt rows rendered as rounded expandable report cards. The collapsed row shows customer, timestamp, mode, decision, score, and top signals.
4. Expanded investigation content preserves the current decision details, reasons, network/device context, related attempts, and action buttons.
5. Loading, empty, and error states use the report-page visual treatment.

### Lists

Keep the block/allow selection and remove behavior. Recompose the list into:

1. A blocklist/allowlist segmented control with the current entry count.
2. Rounded entry rows showing list type, identity kind, safe display hint, reason, and creation date when available.
3. A consistent remove action and error feedback.
4. Report-style empty and error states.

### Accuracy

Keep the 7/30-day range and existing accuracy response. Recompose it into:

1. A range control with the selected period clearly active.
2. Summary cards for assessments, hold rate, block precision, and fake caught.
3. A labeled-outcomes summary for genuine customers held/blocked and fake orders missed.
4. A signal-accuracy section with compact rows, counts, and lightweight visual bars for precision values.
5. Existing target values and “Not enough labels” handling remain visible and unchanged.

### Settings

Keep the existing settings fetch/update contract. Recompose the form into report-style grouped sections:

1. Protection mode selector with a short explanation of Off, Shadow, and Active behavior.
2. Districts requiring review as a scrollable, responsive checkbox section.
3. Additional abuse terms as a clear textarea section.
4. Save button, success status, and error status using report-page feedback patterns.

The page remains admin-gated through the existing route and API authorization.

## Page composition

The tab bar remains present and Reviews remains the default selected tab. The four redesigned panels are rendered inline in the existing `OrderProtection` page. The Reviews component is not modified.

If a shared visual primitive is useful, keep it local to `RiskDashboard.tsx` rather than introducing a broad design-system refactor. Avoid unrelated changes to the page shell.

## Data and error behavior

- Reuse `src/lib/orderRisk.ts` wrappers unchanged.
- Keep local loading and error state per panel.
- Clear or replace stale data when the selected filter/range/list changes.
- Preserve mutation behavior for labels, list removal, and settings saves.
- Display API errors in visible `role="alert"` regions.
- Use disabled/loading states while mutations are in flight.
- Never add client-side organization identifiers or raw hashed identity values.

## Testing plan

Update the existing risk dashboard page tests to cover:

- Reviews remains the default view.
- All four redesigned tabs still render and switch correctly.
- Attempts summary cards and expandable investigation render.
- Attempts filter changes still request the expected data.
- Lists block/allow switching, entry rendering, and removal remain functional.
- Accuracy range switching, summary values, and “not enough labels” behavior remain visible.
- Settings loading, grouped fields, save success, and save errors remain functional.
- Keyboard-accessible tabs, expandable attempt cards, labeled controls, and focus-visible states are present.
- Existing backend route/auth/workspace guard tests remain unchanged and passing.

Run the focused risk dashboard tests first, then the full test suite, lint, and build before completion.

## Acceptance criteria

- Attempts, Lists, Accuracy, and Settings visually match the report-page language: warm background, report surfaces, typography, spacing, and motion.
- Reviews tab and `OrderProtectionReviewQueue` behavior are unchanged.
- No API, database, auth, or scoring behavior changes.
- Existing mutations and filters continue to work.
- Loading, empty, error, and insufficient-data states are clear and accessible.
- Focused tests, full tests, lint, and build pass.
