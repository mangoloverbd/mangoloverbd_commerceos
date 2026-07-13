# Sales Trend Footer Totals Design

## Goal

Update the Order Analysis Sales Trend card so the chart's left-side value labels align with the calendar grid rows, and add selected-period revenue totals for new and existing customers to the left side of the `Less` / `More` intensity legend.

## Approved Layout

Use the footer-totals layout:

- Keep the `Less` / `More` intensity legend on the bottom-right.
- Add two compact totals on the bottom-left: `New Customer` and `Existing Customer`.
- Totals should update when the user switches between `Weekly`, `Monthly`, and `Yearly`.
- Use the same selected-period window already used for total revenue: 7 days, 30 days, or 365 days ending on the most recent sales-trend date.
- Preserve the existing minimalist visual style: small uppercase labels, tabular currency values, no new heavy card treatment.

## Chart Alignment

The Y-axis labels should visually line up with the seven calendar rows. The existing axis uses independent spacing, which can drift from the grid's cell/gap layout. The fix should make the axis use the same seven-row grid structure as the chart cells so `60k` through `0k` align with their corresponding row centers.

## Data Flow

No API changes are needed. `GitHubCalendar` already receives daily `newCustomerRevenue` and `existingCustomerRevenue` values in `SalesTrendDay[]`. The component should sum these fields across the selected range.

## Testing

Update the existing `salesTrendCalendar` component tests to verify:

- New and existing customer footer totals render.
- Totals change based on the selected range data.
- Existing labels remain customer-based, not user-based.

## Out of Scope

- New backend endpoints.
- New chart library.
- Changes to the hover tooltip behavior.
- Changes to customer classification logic.
