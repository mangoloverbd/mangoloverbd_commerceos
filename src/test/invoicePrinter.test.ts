import { describe, expect, it } from "vitest";

import {
  buildInvoiceHtml,
  type InvoiceOrder,
} from "@/utils/invoiceGenerator";

function makeOrder(overrides: Partial<InvoiceOrder> = {}): InvoiceOrder {
  return {
    id: "order-1",
    order_number: "#ML567907",
    customer_name: "Rahim Uddin",
    phone: "01700 000000",
    address: "House 12, Dhaka, Bangladesh",
    product: null,
    quantity: 3,
    price: 1500,
    status: "confirmed",
    created_at: "2026-09-06T12:00:00.000Z",
    delivery_rate: 80,
    courier_status: "pending",
    consignment_id: 999,
    tracking_code: "20250523001",
    courier_message: "Sent to Pathao",
    notes: "Handle with care",
    items: [
      { product_name: "Mango Honey", variant_name: "1 kg jar", quantity: 2 },
      { product_name: "Chia Seed", variant_name: "500 g pouch", quantity: 1 },
    ],
    ...overrides,
  };
}

describe("A4 invoice HTML", () => {
  it("renders the complete Bold Shipping invoice from structured order data", () => {
    const html = buildInvoiceHtml([makeOrder()], "Mango Lover BD");

    expect(html).toContain("@page { size: A4 portrait; margin: 0; }");
    expect(html).toContain("width: 210mm;");
    expect(html).toContain("height: 297mm;");
    expect(html).toContain('<section class="invoice-page">');
    expect(html).toContain('/mango-lover-print-logo.png');
    expect(html).toContain('<div class="invoice-title">INVOICE</div>');
    expect(html).toContain("#ML567907");
    expect(html).toContain("Sep 06, 2026");
    expect(html).toContain("Confirmed");
    expect(html).toContain("Pathao");
    expect(html).toContain("999");
    expect(html).toMatch(/<svg[^>]+class="barcode"/);
    expect(html).toContain("Rahim Uddin - 01700000000");
    expect(html).toContain("House 12, Dhaka");
    expect(html).toContain("CASH ON DELIVERY");
    expect(html).toContain("<tr><th>Product</th><th>Weight</th><th>Qty</th></tr>");
    expect(html).toContain('<td class="product">Mango Honey</td>');
    expect(html).toContain('<td class="weight">1 kg jar</td>');
    expect(html).toContain('<td class="quantity">2</td>');
    expect(html).toContain("Handle with care");
    expect(html).toContain("৳1,500.00");
    expect(html).toContain("৳80.00");
    expect(html).toContain("৳1,580.00");
    expect(html).toContain("CUSTOMER COPY");
  });

  it("prints one A4 invoice page per selected order", () => {
    const html = buildInvoiceHtml([
      makeOrder(),
      makeOrder({ id: "order-2", order_number: "#ML567908" }),
    ]);

    expect(html.match(/<section class="invoice-page">/g)).toHaveLength(2);
    expect(html).toContain("page-break-after: always");
    expect(html).toContain(".invoice-page:last-child { page-break-after: auto;");
  });

  it("uses tracking for the barcode and allows invoices without courier identifiers", () => {
    const trackingHtml = buildInvoiceHtml([
      makeOrder({ consignment_id: null, tracking_code: "TRACK-123" }),
    ]);
    const unassignedHtml = buildInvoiceHtml([
      makeOrder({ consignment_id: null, tracking_code: null }),
    ]);

    expect(trackingHtml).toContain('aria-label="Invoice barcode TRACK-123"');
    expect(trackingHtml).toContain("TRACK-123");
    expect(unassignedHtml).toContain("NOT ASSIGNED");
    expect(unassignedHtml).not.toMatch(/<svg[^>]+class="barcode"/);
  });

  it("escapes dynamic values and omits address noise", () => {
    const html = buildInvoiceHtml([
      makeOrder({
        customer_name: "<script>alert('x')</script>",
        address: "House <7>, 127.0.0.1, Bangladesh",
        notes: "Leave at A&B <desk>",
        items: [{ product_name: "Honey & Jam", variant_name: 'Jar "Large"', quantity: 1 }],
      }),
    ]);

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(html).toContain("House &lt;7&gt;");
    expect(html).not.toContain("127.0.0.1");
    expect(html).not.toContain("Bangladesh");
    expect(html).toContain("Leave at A&amp;B &lt;desk&gt;");
    expect(html).toContain("Honey &amp; Jam");
    expect(html).toContain("Jar &quot;Large&quot;");
  });

  it("falls back to legacy product text and inline quantities", () => {
    const html = buildInvoiceHtml([
      makeOrder({
        items: [],
        product: "2x Dried Mango, 1x Chia Seed",
        quantity: 3,
      }),
    ]);

    expect(html).toContain('<td class="product">Dried Mango</td>');
    expect(html).toContain('<td class="quantity">2</td>');
    expect(html).toContain('<td class="product">Chia Seed</td>');
    expect(html).toContain('<td class="weight">—</td>');
  });
});
