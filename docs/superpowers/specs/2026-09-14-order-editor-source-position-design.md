# Order Editor Source Position Design

## Goal

Move the editable Order source selector into the customer-section header on the Order Editor page only. The New Order creation page must remain unchanged.

## Design

`CustomerPanel` will keep consuming the existing `source`, `onSourceChange`, and `sourceDisabled` props. The current source label and `OrderSourceSelect` will move from the content area below the customer details into the header’s right-side control group, immediately before the customer name/Edit action. The header will wrap on narrow screens, and the selector will use a bounded width so the customer identity remains readable.

No source values, callbacks, API requests, persistence behavior, disabled rules, or backend code will change. The existing Order Editor tests will gain a layout assertion while retaining coverage for source-only saves and editing dispatched orders. `src/pages/NewOrder.tsx` will not be modified.

## Acceptance Criteria

- The Order Editor shows Order source in its customer-section header.
- The Order source control remains accessible as `Order source`.
- Source changes continue to save independently through the existing PATCH flow.
- Source editing remains available after courier dispatch.
- The New Order page’s source selector stays in its current position.
- Focused and full test, lint, build, and whitespace checks pass.
