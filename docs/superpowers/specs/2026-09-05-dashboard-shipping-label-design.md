# Dashboard Shipping Label Design

## Goal

Replace the Dashboard order table's current invoice-style Print output with a compact shipping sticker that matches Mango Lover BD's parcel-label workflow. Keep the downloadable Invoice PDF and Inbox Orders printing unchanged.

## Print Format

- Physical size: 3 inches wide by 4 inches high, portrait.
- Output: black-and-white, optimized for thermal printers.
- Pagination: one order label per printed page.
- Bulk selection: each selected order produces its own label.

## Label Content

Each label contains:

1. The Mango Lover logo, sourced from `imgi_67_mango-lover-desktop-header-footer-img-700x137.avif` and rendered in monochrome.
2. A scannable Code 128 barcode.
3. A prominent CN value.
4. Order number and customer name.
5. Customer phone number, delivery address, and COD amount.
6. A product table with Product, Weight, and Quantity columns. The selected variant label is displayed as Weight.

The barcode and CN value use the Steadfast tracking code when available, falling back to the consignment ID.

## Product Data

The label uses each order item's selected variant label as its Weight value. This matches the storefront flow where customers select a weight variant. It does not add a separate calculated-weight column or require a database or API schema change.

Legacy orders without structured order items fall back to the existing product description and order quantity. Unknown variants display an em dash in the Weight column.

## Validation and Errors

- If any selected order lacks both a tracking code and consignment ID, printing is stopped before opening the browser print dialog.
- The Dashboard shows a warning that identifies the affected order or orders.
- Customer or item fields that are absent use compact fallbacks without breaking the label layout.

## Implementation Boundary

- Add a dedicated Dashboard shipping-label print path rather than changing the shared invoice print function used by Inbox Orders.
- Keep `generateInvoice()` and the Invoice button behavior unchanged.
- Keep the current hidden-iframe browser print mechanism.
- Leave the print document title blank and retain zero page margins to minimize browser-added headers and footers. Browsers may still require the operator to disable their Headers and footers print setting because web code cannot override it.
- Generate the barcode locally in the browser; no third-party barcode service or network request is used.
- Add the supplied Mango Lover logo as a repository asset in a browser-compatible format.

## Testing

- Unit-test CN resolution and missing-CN validation.
- Unit-test product rows, variant names, weight formatting, customer details, COD amount, escaping, and 3-by-4-inch print CSS.
- Verify one label per page for bulk printing.
- Run lint, tests, and the production build.
