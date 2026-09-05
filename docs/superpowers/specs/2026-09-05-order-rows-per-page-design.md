# Order Rows-Per-Page Design

## Goal

Add a compact rows-per-page dropdown to the Dashboard order table and each Warehouse order table.

## Scope and data boundaries

- The Dashboard control paginates the Dashboard's filtered order list across all warehouses, or the currently selected warehouse when that filter is active.
- The Warehouse control paginates only orders returned for the warehouse currently being viewed.
- The two controls keep independent saved preferences.
- Search, status, and warehouse filters run before pagination.
- No API, server, Supabase, or schema changes are needed.

## Behavior

- Available sizes: 20, 50, 100, 150, and 200 rows.
- Default size: 100 rows.
- Changing the size resets that table to page 1.
- Changing search, status, or warehouse filters resets the affected table to page 1.
- Dashboard and Warehouse selections are saved separately in local storage.
- A safe fallback of 100 is used when storage is unavailable or contains an unsupported value.
- The current page is clamped when filtering or refreshed data reduces the number of pages.

## UI

- Add the supplied Radix/shadcn-style Select implementation at `src/components/ui/interfaces-select.tsx`.
- Place the shared page-size dropdown immediately to the right of the search field in the order-table toolbar on both pages.
- Show only the selected numeric value in the toolbar. Keep the descriptive accessible label on the dropdown, but do not render visible `Rows per page` text.
- Keep only page position and Previous/Next actions in the shared footer below `OrdersTable`: Previous aligned left, page position centered, and Next aligned right.
- Keep the toolbar selector visible even when there is only one page.
- Keep the footer visible so page position and disabled navigation remain clear.
- Stack or wrap footer controls on narrow screens without clipping.
- Match the existing gray table controls and restrained Merchant-Suite styling.

## Accessibility

- Give each dropdown an explicit accessible label tied to its table context.
- Keep Radix Select keyboard behavior and focus management.
- Disable Previous and Next at the first and last page.
- Expose the current page and total pages as readable text.

## Testing

- Verify the shared selector renders all supported sizes and reports changes.
- Verify Dashboard displays only the selected number of filtered orders and resets to page 1 when the limit changes.
- Verify Warehouse pagination only affects that warehouse's orders and remains independent from Dashboard storage.
- Verify unsupported stored values fall back safely.
