# Packing Summary Print Design

**Status:** Draft — pending user review (2026-09-17)

## Goal

Add a `Packing Summary` print action to the Dashboard `Print` tab that gives the floor team a single pack-table for everything waiting in Print before bulk Steadfast dispatch.

## Agreed flow

1. Merchant opens the `Print` status tab.
2. Merchant clicks `Packing Summary` (header area, no selection required).
3. A browser print view opens (same hidden-iframe flow as Invoice/Sticker) → Save as PDF or print.
4. Team packs from the summary totals and ticks off rows by hand.
5. Multi-product orders are picked from the exception list below the summary.

## Scope

- Covers **all** orders in the Print queue, not just selected rows and not just the current page.
- Summary-only plus multi-item exceptions (no full per-order detail pages).

## Layout (A4 portrait, invoice black-header style)

Header:
- `MANGO LOVER BD — PACKING SUMMARY`
- Date + `N orders · M kg to pack`

Section 1 — Summary table (all units, including multi-item orders):
- Columns: `Product | Pack | Orders | Total kg | ☐ Packed`
- One row per `product_name + variant_name` (6KG separate from 10KG).
- `Orders` = distinct order IDs containing that line.
- `Total kg` = sum of `qty × weight_kg` per line.
- No packets/qty column (1 order = 1 unit assumption for display; kg math still uses real qty).
- Footer row: total orders + total kg.
- Large Bengali-safe product names, zebra rows, big hand-tick boxes.
- Note under table: `kg already includes multi-item orders below — do not pack twice.`

Section 2 — Multi-item exceptions only:
- One line per order with 2+ products: `#OrderNumber: Product A Pack + Product B Pack | ☐`
- Single-product orders are NOT listed by ID.
- Each exception line has its own tick box.

## Data / grouping logic

- Group key: normalized `product_name + variant_name`.
- Weight resolution: variant `weight_kg` first, product `weight_kg` fallback (same rule as order editor).
- Missing weight: show `—`, exclude from kg total, flag in a small note.
- Legacy orders without `items`: fall back to parsing the `product` text string (same parser as invoice).
- Button disabled with empty-state message when Print queue is 0.

## Placement

- New `Packing Summary` button in the Dashboard Print tab header area.
- Visible only when `activeOrderStatusFilter === "print"`.
- Uses `apiFetch`-loaded order data + catalog weights already available to the table; no new backend route.

## Non-goals

- No backend PDF generation endpoint.
- No per-order full detail pages.
- No Excel changes (existing Excel export untouched).
- No auto-print on bulk Steadfast send.
- No print-history/audit column.
- No storefront/public-API change.

## Edge cases

- Empty Print → button disabled.
- Unknown weights → `—` + note, never 0kg silently.
- Paginated Print queue → summarize the full filtered list, not just the visible page.
- Bilingual product names render with existing Bengali-capable print font stack.

## Testing

- Unit: grouping by product+variant, orders-count vs qty math, missing-weight `—` handling, legacy text fallback, multi-item exception detection.
- Component: button renders only in Print view, disabled when empty, opens print flow.
- Print HTML: header/totals/tick boxes present, exception lines carry tick boxes.
- Run focused tests, full Vitest suite, lint, production build before completion.
