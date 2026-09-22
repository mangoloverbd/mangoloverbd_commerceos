# Dashboard Order ID New-Tab Design

## Goal

Let staff open an order's existing Order editor page in a new browser tab by clicking its Order ID in any main Dashboard order-status tab. Keep the Dashboard open so its selected tab, filters, and working context are not interrupted.

## Scope

This behavior applies to the shared desktop order table and mobile order cards used by the main Dashboard status tabs.

It does not change order IDs shown on Returns, Warehouses, Customers, alerts, or other pages.

## User Experience

- The visible Order ID is a real link to `/orders/:id`.
- Clicking or tapping the Order ID opens that order's existing Order editor page in a new browser tab.
- The original Dashboard tab remains open and unchanged.
- Clicking elsewhere on the row or mobile card keeps the existing behavior and opens the order in the current tab.
- On desktop, hover and keyboard focus add a subtle underline and a small Phosphor open-in-new-tab icon.
- The link has an accessible label such as `Open order ML-1234 in a new tab`.
- Native browser actions continue to work, including right-click, copy link, and Cmd/Ctrl-click.

## Architecture

Add a focused shared component under `src/components/orders/` that accepts an order database ID and displayed order number. It renders a React Router link with:

- A destination of `/orders/:id`.
- `target="_blank"`.
- `rel="noopener noreferrer"`.
- Click propagation stopped so the surrounding row or card does not also navigate.
- Shared hover, focus, icon, and accessibility styling.

Use this component in:

- `src/components/OrdersTable.tsx` for desktop Dashboard rows.
- `src/components/MobileOrderCards.tsx` for mobile Dashboard cards.

No API, authentication, or database changes are required. The new tab loads the existing protected Order Detail route and follows the current authentication behavior.

## Error Handling

- If a session has expired, the existing protected-route logic redirects the new tab to authentication.
- Order loading and not-found behavior remain owned by the existing Order editor page.
- The Dashboard stays usable because opening the new tab does not change its route or state.

## Testing

Automated tests will verify that:

- Desktop and mobile Order IDs link to the correct `/orders/:id` route.
- The links use `_blank` and the required relationship attributes.
- Clicking the Order ID does not trigger surrounding row or card navigation.
- Clicking elsewhere preserves existing current-tab navigation.
- The link has an accessible name and can receive keyboard focus.
- All main Dashboard status tabs inherit the behavior through the shared table and mobile-card components.

## Out of Scope

- Changing whole-row navigation to open a new tab.
- Adding hover previews or order popovers.
- Changing order links outside the main Dashboard status tabs.
- Changing the Order editor itself.
