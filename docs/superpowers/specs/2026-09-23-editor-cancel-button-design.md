# Editor Cancel Button Design

## Goal

Use the BoardUI ghost button for the main Cancel action on both the existing-order editor and new-order creation page.

## Scope

- Replace the main Cancel button rendered by `CartPanel` for existing orders.
- Replace the main navigation Cancel button in `NewOrder`.
- Preserve click handlers, disabled states, labels, and navigation behavior.
- Leave note-popover and dialog-specific Cancel buttons unchanged.
- Install or confirm the BoardUI button with `npx boardui@latest add button --yes`.

## Testing

Existing editor tests will assert that both main Cancel controls use the BoardUI ghost variant classes and retain their behavior.
