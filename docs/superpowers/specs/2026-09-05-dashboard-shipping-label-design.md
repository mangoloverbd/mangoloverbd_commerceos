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

The barcode and CN value use the courier consignment ID shown in fulfillment, falling back to the tracking code.

## Recipient Details Layout

Use the approved **Balanced stack** layout for the customer-details section. This supersedes the earlier Recipient-first selection:

1. Start with two equal-width columns. The left column contains a small uppercase `ORDER` label above the bold `#<number>` value. The right column contains a small uppercase `COD` label above the bold `৳<amount>` value.
2. Separate the two-column metadata row from the customer stack with one thin solid rule. Do not use dashed separators in this section.
3. Add a small uppercase `CUSTOMER` eyebrow below the rule.
4. Show the customer name and phone number together in one bold, no-wrap contact row: `<UPPERCASE NAME> - <PHONE>`.
5. Use a normal contact-row size of 15px, slightly smaller than the previous separate name and phone lines. Group an 11-digit Bangladeshi number as five digits followed by six digits for readability, without changing its value.
6. Select a smaller contact-row class from the combined display-text length so longer names remain on one line: 13px above 32 characters, 11px above 40 characters, and 9px above 48 characters.
7. Separate the address with one thin solid rule. Add a small uppercase `ADDRESS` label, then show the full-width address with enough line height to support wrapping.

The balanced stack uses compact labels to make each value immediately recognizable. It does not use an outlined COD box or a `DELIVER TO` eyebrow.

## Product Data

The label uses each order item's selected variant label as its Weight value. This matches the storefront flow where customers select a weight variant. It does not add a separate calculated-weight column or require a database or API schema change.

Legacy orders without structured order items fall back to the existing product description and order quantity. Unknown variants display an em dash in the Weight column.

## Vertical Space Allocation

- Keep the logo, barcode, CN, Order/COD, customer contact row, and address together in a compact summary block with a typical minimum height of 1.58 inches, approximately 40% of the 4-inch label.
- Compress the summary's vertical gaps, logo, and barcode while preserving barcode scanability and full recipient information. The summary may grow slightly for a wrapping address rather than clipping it.
- Start the product table immediately after the summary and make the remaining label height available to it.
- Use compact table typography and approximately 0.29-inch product rows so an order containing up to five normal product entries, including wrapped bilingual names, fits within one label.
- Do not split one order across multiple labels or change the one-order-per-page rule.

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
