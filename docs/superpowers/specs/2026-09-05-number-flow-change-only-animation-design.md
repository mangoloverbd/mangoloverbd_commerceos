# NumberFlow Change-Only Animation Design

## Goal

The P&L section must remain visible when the Dashboard remounts after navigation. Its numbers and mini charts should animate only when refreshed analytics contain genuinely changed values or series data.

## Design

- Keep the existing `@number-flow/react` dependency and shadcn wrapper at `src/components/ui/number-flow.tsx`.
- Render NumberFlow with `animated={false}` on the wrapper's first render.
- Enable NumberFlow animation after the wrapper mounts without changing the displayed value.
- Once mounted, pass subsequent numeric value changes to NumberFlow with animation enabled.
- Scope the module-level analytics snapshot to the signed-in user and do not clear it on every Dashboard mount.
- Restore the snapshot's selected date range so custom-range P&L views also survive navigation without a reload.
- Initialize both analytics and order loading state from their existing caches so route navigation cannot flash the full-page or P&L skeleton.
- Immediately revalidate the selected range silently. Keep the current state object when the response is unchanged; update numbers and charts only when response data differs.
- Disable P&L container, metric-content, and mini-chart mount animations. Enable mini-chart animation only when its data signature changes.
- Preserve the existing `৳` prefix, `en-BD` grouping, tabular styling, responsive layout, and reduced-motion behavior supplied by NumberFlow.

## Non-goals

- No click-to-cycle demo behavior.
- No new assets, icons, context providers, routes, or state-management library.
- No API or database changes.
