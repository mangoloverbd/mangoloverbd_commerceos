# Settings Add Member Button Design

## Summary
Replace the Settings page **Add Member** submit button with the shared shadcn `Button` component so it matches the app's standard button styling.

## Current state
- File: `src/components/TeamManagement.tsx`
- The Add Member form currently uses `LiquidMetalButton` for its submit action.
- The shared app button already exists at `src/components/ui/button.tsx`.

## Proposed change
- Remove `LiquidMetalButton` from the Add Member form.
- Import and use `Button` from `@/components/ui/button`.
- Preserve existing behavior:
  - `type="submit"`
  - `disabled={creating || !email.trim()}`
  - label text: `creating ? "Adding…" : "Add Member"`
  - existing `data-testid`
- Keep the change scoped to the Add Member button only.

## Approach options considered
1. Direct swap to shared `Button` (**recommended**)
2. Shared `Button` plus extra width/layout styling
3. New custom button variant

The recommended approach is option 1 because it is the smallest change and aligns the button with the shared design system without introducing new variants.

## Architecture / component impact
- Modify only `src/components/TeamManagement.tsx`
- No API, state, routing, or database changes
- No multi-tenancy or auth changes

## Error handling / behavior
- No behavior changes expected
- Existing disabled/loading label behavior remains unchanged

## Testing
- Verify the Add Member form still submits normally
- Verify the button shows `Adding…` while creating
- Verify the button is disabled when email is empty
- Verify no regressions in the Team Management section layout

## Scope guardrails
- Do not change any other buttons on the Settings page
- Do not add new button variants
- Do not modify backend code
