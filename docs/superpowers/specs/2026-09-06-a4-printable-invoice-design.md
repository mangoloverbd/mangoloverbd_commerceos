# A4 Printable Invoice Design

## Goal

Replace invoice PDF downloads with a native browser print flow and redesign the invoice as a detailed A4 portrait document using the approved Bold Shipping Style. Use the same invoice design for Dashboard orders and Inbox Orders while keeping the existing 3-inch by 4-inch shipping sticker available through each screen's Print action.

## Print Behavior

- Clicking `Invoice` in the Dashboard selection bar opens the browser's native print dialog instead of downloading a PDF.
- Clicking `Invoice` in the Inbox Orders selection bar opens the same browser print dialog and uses the same invoice design.
- Clicking `Print` in either selection bar prints the existing 3-inch by 4-inch shipping sticker.
- Shipping-sticker validation remains unchanged: if an order has neither a consignment ID nor a tracking code, stop the sticker batch and identify the affected orders.
- Print one selected order per A4 portrait page.
- Use `@page { size: A4 portrait; margin: 0; }` and an exact 210mm by 297mm invoice page.
- Do not download an invoice PDF or fall back to a download when browser printing cannot initialize.

## Visual Direction

Use the approved **Bold Shipping Style**:

- A full-width black header with the Mango Lover identity on the left and `INVOICE` plus the order number on the right.
- Strong black rules, compact uppercase labels, bold values, and a clear black-and-white hierarchy inspired by the shipping sticker.
- A print-safe monochrome presentation, except where the browser or printer applies its own print settings.
- No decorative card shadows, rounded panels, or fragile badge.

## Invoice Sections

Each invoice contains:

1. **Header:** the existing `/mango-lover-print-logo.png` asset rendered in monochrome, `INVOICE`, and order number.
2. **Order metadata:** invoice date, order status, courier, and CN/tracking value.
3. **Barcode:** Code 128 generated locally from the consignment ID, falling back to the tracking code. If neither exists, show `NOT ASSIGNED` and omit the barcode without blocking invoice printing.
4. **Customer:** customer name, phone number with whitespace removed, and full cleaned delivery address.
5. **Payment:** cash-on-delivery label, subtotal, delivery fee, and total amount due.
6. **Products:** a sticker-style table with `Product`, `Weight`, and `Qty` columns.
7. **Totals:** subtotal, delivery fee, grand total, and due amount.
8. **Notes and footer:** order notes when present, a short thank-you message, and `CUSTOMER COPY`.

## Product Data

- Prefer structured `items` for both Dashboard and Inbox Orders.
- Render `product_name` as Product, `variant_name` as Weight, and item `quantity` as Qty.
- Inbox items map their product text to Product. If no variant label is available, Weight displays an em dash.
- Legacy orders without structured items use the existing comma-separated product parser and inline quantity parser.
- The order record has only an order-level product subtotal, not authoritative per-line prices. Do not invent or proportionally allocate unit prices. Keep monetary values in the totals section.
- Escape all customer, order, note, and merchandise text before inserting it into printable HTML.

## Shared Print Architecture

- Replace the old jsPDF implementation with a pure `buildInvoiceHtml(orders, businessName?)` function and a `printInvoice(orders, businessName?)` browser-print wrapper.
- The HTML builder owns invoice normalization, product-row generation, pagination markup, and print CSS.
- The print wrapper writes the generated HTML into a hidden iframe, waits for it to load, invokes `window.print()`, and removes the iframe after printing.
- If iframe initialization fails, throw an error to the caller. Never download a PDF as a fallback.
- Generate Code 128 barcodes locally with the existing `jsbarcode` dependency. No remote barcode service is allowed.
- Remove the unused jsPDF invoice generator and its direct application dependency after all invoice actions use browser printing.

## Screen Wiring

### Dashboard

- Replace `handleGenerateInvoice` with a lightweight invoice print handler.
- Dynamically import `printInvoice` so invoice code stays out of the initial Dashboard bundle.
- Keep the `Invoice` label and FileText icon.
- Keep the adjacent `Print` action connected only to `printShippingLabels`.

### Inbox Orders

- Map Inbox orders into the shared printable order shape, including structured product rows, notes, delivery rate, consignment ID, and tracking code.
- Connect `Invoice` to `printInvoice`.
- Connect `Print` to `printShippingLabels`.
- Show the same missing-CN/tracking warning used by Dashboard sticker printing.

## Error Handling

- Ignore an Invoice action when no orders are selected.
- Show a concise error toast if invoice printing cannot initialize.
- Do not show a fake success toast before the native print dialog completes; browser print completion cannot be reliably detected.
- Preserve sticker-specific missing courier identifier errors without applying them to invoices.

## Testing

- Unit-test A4 portrait page dimensions and one invoice page per order.
- Unit-test all required sections, barcode presence and no-barcode fallback, continuous phone output, cleaned address, notes, monetary totals, and HTML escaping.
- Unit-test structured Product / Weight / Qty rows and legacy product fallback.
- Test Dashboard and Inbox action wiring so Invoice uses `printInvoice` and Print uses `printShippingLabels`.
- Test Inbox order mapping for structured items and courier identifiers.
- Run the full Vitest suite, ESLint, production build, and `git diff --check` before merging locally.
