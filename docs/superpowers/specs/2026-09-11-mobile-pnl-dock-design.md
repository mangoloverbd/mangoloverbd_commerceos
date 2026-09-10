# Mobile P&L Hierarchy and Storefront Dock Styling

## Goal

Improve the dashboard's mobile financial summary without changing the desktop presentation. Revenue should be the first and most prominent number because it is the primary operating signal in the daily workflow.

## Mobile P&L design

- Keep the existing desktop five-card grid unchanged at `md` and wider.
- Below `md`, render Revenue as a full-width hero card with the largest value and trend.
- Render Net Profit as the next emphasized card, using the existing value and trend semantics.
- Render Ad Spend, Shipping, and Cost of Goods as compact supporting cards in a two-column grid; the last card spans the remaining width when needed.
- Keep all five metrics visible without horizontal scrolling.
- Preserve loading, unavailable values, trend colors, and the admin blur behavior.

## Mobile dock styling

Use the dedicated storefront dock treatment for the existing Merchant Suite destinations:

- Fixed inset dock: `inset-x-3 bottom-3`, `h-16`, `rounded-[8px]`.
- Neutral translucent surface with white border, white icons/text, strong shadow, and backdrop blur.
- Keep the existing five destinations and routing behavior: Home, Orders, Inbox, Products, and More.
- Preserve the central active-style treatment by using clear active text/icon styling and a touch-friendly hit area.
- Keep the dock mobile-only with `md:hidden` and retain bottom content padding.

## Testing

- Add a component-level test for the mobile P&L hierarchy and metric ordering.
- Update the mobile navigation test to assert the storefront dock class treatment while preserving accessible labels and routes.
- Run the full Vitest suite, lint, and production build.
