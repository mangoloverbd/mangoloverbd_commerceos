# Create Order Modal Redesign

## Goal

Turn the Dashboard's Create Order dialog into a modern Order Desk that matches the visual language of Customers, Dashboard, and Inbox Orders while keeping the existing manual-order workflow and protection behavior unchanged.

## Design direction

The modal uses Merchant Suite's existing luxury-minimal interface: warm white surfaces, black typography, soft black-tinted field backgrounds, rounded-2xl sections, thin low-contrast borders, compact uppercase labels, and restrained motion. The composition should feel like a focused work surface rather than a generic form dialog.

## Layout

### Modal shell

- Use a wide responsive shell (`max-w-5xl`) with a viewport-safe height (`max-h-[90vh]`).
- Keep the overlay and spring entrance animation already used by the application.
- The shell has three regions: header, scrollable content, and a sticky action footer.
- Only the content region scrolls. The footer remains visible while a long order is being edited.
- Preserve the accessible Radix dialog title, description, close button, and keyboard dismissal.

### Header

- Add a small `NEW ORDER` eyebrow label.
- Keep `Create Order` as the primary title.
- Use a short supporting line: `Build a protected order from a message or from the catalog.`
- Keep the close control quiet and aligned to the top-right.

### Desktop content

At `lg` widths, use two columns:

```text
┌──────────────────────────────────────────────────────────────┐
│ NEW ORDER                         Create Order            ×   │
├──────────────────────────────┬───────────────────────────────┤
│ Capture & customer            │ Cart & order summary          │
│                              │                               │
│ AI message capture            │ Product search                │
│ Customer name / phone         │ Product line items            │
│ Delivery address               │ Delivery toggle              │
│ Payment / notes                │ Subtotal / discount / due     │
│                              │ Total                         │
├──────────────────────────────┴───────────────────────────────┤
│ Protection status       Cancel                    Create Order │
└──────────────────────────────────────────────────────────────┘
```

The left column is the data-entry side. The right column is the order-building side and should remain visually scannable as the cart grows.

### AI capture section

- Give the message textarea a distinct, slightly darker soft surface and a small sparkle/AI marker.
- Keep the existing `Extract Order Details` action as the primary action within this section.
- Show the action's loading state without changing the surrounding layout.
- Keep extraction errors in the existing toast channel.

### Customer section

- Group name and phone into a compact two-field row on desktop.
- Put the delivery address beneath them at full width.
- Use the same rounded, borderless field treatment as Customers and Dashboard filters.
- Keep all existing labels, placeholders, and state bindings.

### Cart section

- Treat the cart as the main visual object: a rounded panel with a `Products` heading and item count.
- Keep the catalog picker inside the cart panel. Its results remain independently scrollable and viewport-safe, including product images.
- Render each selected product as an image-led row with product name, variant selector when needed, unit price, quantity stepper, line total, and remove action.
- Preserve support for manually entered extracted products that do not have a catalog product id.
- Keep the cart list constrained so a large order does not push the modal footer off-screen.

### Summary and checkout details

- Keep delivery as a compact toggle row with the delivery amount visible.
- Keep subtotal, discount, advance, total, and due-after-advance in a clear vertical summary.
- Make the total the strongest monetary value using the existing taka formatting.
- Keep payment method and notes available without introducing another dialog or step.

### Action footer

- Separate the footer with a low-contrast top border.
- Keep fraud protection as an explicit checkbox with `ShieldCheck` icon and a short label.
- Keep Cancel visually quiet and Create Order visually primary.
- Disable only the Create Order action while submission is in progress, preserving the current loading label and spinner.

## Responsive behavior

- At small widths, switch to one column in this order: AI capture, customer, cart, summary/payment, footer.
- Keep the content region scrollable and the action footer visible.
- Product rows must wrap controls rather than create horizontal page scrolling.
- The catalog picker must stay within the viewport on mobile and retain its own scroll region.

## Behavior and data boundaries

- Do not change API routes, request payloads, validation rules, extraction behavior, fraud-check behavior, or reset behavior.
- Continue loading catalog products when the dialog opens through `apiFetch`.
- Continue sending all order creation requests through `apiFetch`.
- Keep all current toast messages and server-side protection behavior.

## Accessibility

- Preserve Radix dialog semantics and the visible `DialogTitle`/`DialogDescription`.
- Keep every form control associated with a visible label or accessible name.
- Preserve keyboard operation for the catalog picker, selects, quantity controls, close button, and submission.
- Maintain adequate focus-visible styling and avoid nested scroll containers that trap pointer or keyboard scrolling unexpectedly.

## Verification plan

- Add or update component tests to verify the major Order Desk sections render and existing submission wiring remains unchanged.
- Keep the product picker regression test asserting that long image-based product lists have a bounded, independently scrollable list.
- Run the full Vitest suite, ESLint, and production build.
- Perform a local browser check at desktop and mobile widths: open Create Order, open the catalog picker, scroll a long product list, add a product, select a variant, and verify the footer remains accessible.
