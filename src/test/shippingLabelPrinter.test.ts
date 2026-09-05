import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildShippingLabelHtml,
  getShippingLabelCn,
  printShippingLabels,
  type ShippingLabelOrder,
} from "@/utils/shippingLabelPrinter";

function makeOrder(overrides: Partial<ShippingLabelOrder> = {}): ShippingLabelOrder {
  return {
    id: "order-1",
    order_number: "#ML567907",
    customer_name: "Rahim Uddin",
    phone: "01700000000",
    address: "Dhaka, Bangladesh",
    product: null,
    quantity: 3,
    price: 1500,
    delivery_rate: 80,
    tracking_code: "20250523001",
    consignment_id: 999,
    items: [
      {
        product_name: "Honey",
        variant_name: "1 kg jar",
        quantity: 2,
      },
      {
        product_name: "Chia Seed",
        variant_name: "500 g pouch",
        quantity: 1,
      },
    ],
    ...overrides,
  };
}

describe("shipping label CN resolution", () => {
  it("uses the same consignment ID shown in fulfillment", () => {
    expect(getShippingLabelCn(makeOrder())).toBe("999");
  });

  it("falls back to the tracking code", () => {
    expect(getShippingLabelCn(makeOrder({ consignment_id: null }))).toBe("20250523001");
  });

  it("rejects blank courier identifiers", () => {
    expect(getShippingLabelCn(makeOrder({ tracking_code: " ", consignment_id: null }))).toBeNull();
  });
});

describe("shipping label HTML", () => {
  it("stops the complete batch when an order has no CN", () => {
    const result = buildShippingLabelHtml([
      makeOrder(),
      makeOrder({ id: "order-2", order_number: "#ML567908", tracking_code: null, consignment_id: null }),
    ]);

    expect(result).toEqual({ ok: false, missingOrderNumbers: ["#ML567908"] });
  });

  it("does not create a print frame for an order without a CN", () => {
    const frameCount = document.querySelectorAll("iframe").length;

    const result = printShippingLabels([
      makeOrder({ tracking_code: null, consignment_id: null }),
    ]);

    expect(result).toEqual({ ok: false, missingOrderNumbers: ["#ML567907"] });
    expect(document.querySelectorAll("iframe")).toHaveLength(frameCount);
  });

  it("renders recipient details with the approved recipient-first hierarchy", () => {
    const result = buildShippingLabelHtml([makeOrder()], "Mango Lover BD");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected printable label HTML");

    expect(result.html).toContain("<title></title>");
    expect(result.html).not.toContain("Mango Lover BD Shipping Label");
    expect(result.html).toContain("999");
    expect(result.html).toContain('<div class="shipment-meta">');
    expect(result.html).toContain(
      '<span class="order-reference">ORDER <strong>#ML567907</strong></span>',
    );
    expect(result.html).toContain('<span class="cod-box">COD ৳1,580</span>');
    expect(result.html).toContain('<div class="deliver-to">DELIVER TO</div>');
    expect(result.html).toContain('<div class="recipient-name">Rahim Uddin</div>');
    expect(result.html).toContain('<div class="recipient-phone">01700 000000</div>');
    expect(result.html).toContain('<div class="recipient-address">Dhaka</div>');
    expect(result.html).not.toContain("<b>Name:</b>");
    expect(result.html).not.toContain("<b>Phone:</b>");
    expect(result.html).not.toContain("<b>Address:</b>");
    expect(result.html).not.toContain('class="order-customer"');
    expect(result.html).not.toContain('class="delivery-details"');
    expect(result.html).toContain("Honey");
    expect(result.html).toContain("1 kg jar");
    expect(result.html).toContain("1 kg");
    expect(result.html).toContain("Chia Seed");
    expect(result.html).toContain("500 g pouch");
    expect(result.html).toContain("<tr><th>Product</th><th>Weight</th><th>Qty</th></tr>");
    expect(result.html).not.toContain("<th>Variant</th>");
    expect(result.html).not.toContain('<td class="variant">');
    expect(result.html).toMatch(/<svg[^>]+class="barcode"/);
    expect(result.html).toContain("<rect");
  });

  it("leaves phone values unchanged unless they are exactly 11 digits", () => {
    const result = buildShippingLabelHtml([
      makeOrder({ phone: "+8801700000000" }),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected printable label HTML");

    expect(result.html).toContain(
      '<div class="recipient-phone">+8801700000000</div>',
    );
  });

  it("escapes all customer and merchandise text", () => {
    const result = buildShippingLabelHtml([
      makeOrder({
        customer_name: "<script>alert('x')</script>",
        address: "House <7> & Road 2",
        items: [{ product_name: "Honey & Jam", variant_name: 'Jar "Large"', quantity: 1 }],
      }),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected printable label HTML");

    expect(result.html).not.toContain("<script>alert");
    expect(result.html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(result.html).toContain("House &lt;7&gt; &amp; Road 2");
    expect(result.html).toContain("Honey &amp; Jam");
    expect(result.html).toContain("Jar &quot;Large&quot;");
  });

  it("uses exact 3-by-4-inch pages with one label per order", () => {
    const result = buildShippingLabelHtml([
      makeOrder(),
      makeOrder({ id: "order-2", order_number: "#ML567908", tracking_code: "20250523002" }),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected printable label HTML");

    expect(result.html).toContain("@page { size: 3in 4in; margin: 0; }");
    expect(result.html.match(/<section class="shipping-label">/g)).toHaveLength(2);
    expect(result.html).toContain("page-break-after: always");
  });

  it("falls back to legacy merchandise fields", () => {
    const result = buildShippingLabelHtml([
      makeOrder({ items: [], product: "3x Dried Mango", quantity: 3 }),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected printable label HTML");

    expect(result.html).toContain("Dried Mango");
    expect(result.html).toContain('<td class="quantity">3</td>');
    expect(result.html).toContain('<td class="weight">—</td>');
  });
});

describe("shipping label action wiring", () => {
  it("routes only the Dashboard Print action to shipping labels", () => {
    const dashboardSource = readFileSync(
      resolve(process.cwd(), "src/components/OrdersTable.tsx"),
      "utf8",
    );
    const inboxSource = readFileSync(
      resolve(process.cwd(), "src/pages/InboxOrders.tsx"),
      "utf8",
    );

    expect(dashboardSource).toContain(
      'const { printShippingLabels } = await import("@/utils/shippingLabelPrinter");',
    );
    const orderItemType = dashboardSource.match(
      /interface OrderItemSummary \{[\s\S]*?\n\}/,
    )?.[0];
    expect(orderItemType).toContain("variant_name: string | null;");
    expect(orderItemType).not.toContain("weight_kg");
    expect(dashboardSource).toContain("printShippingLabels(selectedOrders, orgName)");
    expect(inboxSource).toContain(
      'import { generateInvoice, printInvoice } from "@/utils/invoiceGenerator";',
    );
    expect(inboxSource).toContain("printInvoice(selectedOrders");
    expect(inboxSource).not.toContain("printShippingLabels");
  });
});
