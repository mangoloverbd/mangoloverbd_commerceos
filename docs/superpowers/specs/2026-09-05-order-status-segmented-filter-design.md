# Order Status Segmented Filter Design

**Status:** Approved by user

## Goal

Add a polished order-status summary and filter to both the Dashboard fulfillment queue and each Warehouse order table, using the existing BoardUI segmented-control component.

## Approved layout

- Place the control directly below each order toolbar and above the shared orders table.
- Show these mutually exclusive buckets in this order: All Orders, Pending, On Hold, Approved, Processing, Ready To Ship, In-Transit, Delivered, Flagged, Cancelled.
- Each segment displays a small status dot, an uppercase label, and a tabular formatted count.
- Keep the control on one line. On narrow viewports, make the strip horizontally scrollable instead of wrapping.
- Use BoardUI's animated selected thumb with the application's restrained neutral palette.

## Styling revision

- Keep the existing BoardUI segmented-control component and selection behavior unchanged.
- Make the control fill the order-table width. On desktop, all ten segments use equal widths.
- Remove the inset gray pill appearance. Use a flat row that aligns with the table edges.
- Separate segments with faint vertical rules. The selected segment keeps BoardUI's white animated thumb.
- Keep labels and counts neutral. Status color appears only in the small dot.
- Reduce vertical padding so the filter reads as part of the table header rather than a separate card.
- Below the desktop breakpoint, preserve a practical minimum segment width and allow horizontal scrolling.

## Behavior

- Selecting a segment immediately filters the visible table and resets pagination to page one.
- Search and warehouse selection compose with the status filter.
- Dashboard counts reflect the currently selected warehouse but remain independent of search, so typing does not make the summary jump.
- Warehouse counts include only orders returned for that warehouse and remain independent of search.
- Every order belongs to exactly one status bucket, so the nine operational counts sum to All Orders.

## Status precedence

Normalize spaces and hyphens to underscores before classification. Explicit business-status values matching a displayed bucket are honored. Otherwise classify in this order:

1. Cancelled: cancelled, rejected, returned, or return-related business/courier states.
2. Delivered: delivered or partial-delivered courier/fulfillment states.
3. In-Transit: transit, dispatched, rider-assigned, out-for-delivery, or delivery-hub states.
4. On Hold: hold states.
5. Processing: a dispatched order in pending, review, pickup, processing, or picked-up courier states.
6. Ready To Ship: ready-to-ship/fulfilled fulfillment states.
7. Flagged: an explicit flagged state or verified courier history below 50% delivery success with at least one parcel.
8. Approved: confirmed/approved business states.
9. Pending: fallback for all remaining orders.

This ordering keeps the buckets mutually exclusive and favors the most advanced or terminal fulfillment state.

## Scope

- Frontend only; no API, database, or schema changes.
- Reuse the existing `/api/orders` payload and existing warehouse-scoped endpoint call.
- Preserve the current search, warehouse selector, toolbar actions, pagination, and shared `OrdersTable`.

## Accessibility and motion

- Keep BoardUI/react-aria keyboard navigation and single selection semantics.
- Give the control an explicit status-filter label.
- Preserve visible focus treatment and respect the existing reduced-motion behavior.
