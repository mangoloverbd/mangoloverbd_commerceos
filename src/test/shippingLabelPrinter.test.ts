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
        weight_kg: 1,
        quantity: 2,
      },
      {
        product_name: "Chia Seed",
        variant_name: "500 g pouch",
        weight_kg: 0.5,
        quantity: 1,
      },
    ],
    ...overrides,
  };
}

describe("shipping label CN resolution", () => {
  it("prefers the Steadfast tracking code", () => {
    expect(getShippingLabelCn(makeOrder())).toBe("20250523001");
  });

  it("falls back to the consignment ID", () => {
    expect(getShippingLabelCn(makeOrder({ tracking_code: null }))).toBe("999");
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

  it("renders the customer, COD, variants, weights, quantities, and barcode", () => {
    const result = buildShippingLabelHtml([makeOrder()], "Mango Lover BD");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected printable label HTML");

    expect(result.html).toContain("Mango Lover BD Shipping Label");
    expect(result.html).toContain("20250523001");
    expect(result.html).toContain("ML567907");
    expect(result.html).toContain("Rahim Uddin");
    expect(result.html).toContain("01700000000");
    expect(result.html).toContain("Dhaka");
    expect(result.html).toContain("৳1,580");
    expect(result.html).toContain("Honey");
    expect(result.html).toContain("1 kg jar");
    expect(result.html).toContain("1 kg");
    expect(result.html).toContain("Chia Seed");
    expect(result.html).toContain("500 g pouch");
    expect(result.html).toContain("500 g");
    expect(result.html).toMatch(/<svg[^>]+class="barcode"/);
    expect(result.html).toContain("<rect");
  });

  it("escapes all customer and merchandise text", () => {
    const result = buildShippingLabelHtml([
      makeOrder({
        customer_name: "<script>alert('x')</script>",
        address: "House <7> & Road 2",
        items: [{ product_name: "Honey & Jam", variant_name: 'Jar "Large"', weight_kg: 1, quantity: 1 }],
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
  it("routes only the Dashboard Print action to shipping labels with item weights", () => {
    const dashboardSource = readFileSync(
      resolve(process.cwd(), "src/components/OrdersTable.tsx"),
      "utf8",
    );
    const inboxSource = readFileSync(
      resolve(process.cwd(), "src/pages/InboxOrders.tsx"),
      "utf8",
    );

    expect(dashboardSource).toContain(
      'import { printShippingLabels } from "@/utils/shippingLabelPrinter";',
    );
    expect(dashboardSource).toMatch(
      /interface OrderItemSummary \{[\s\S]*?weight_kg\?: number \| null;/,
    );
    expect(dashboardSource).toContain("printShippingLabels(selectedOrders, orgName)");
    expect(inboxSource).toContain(
      'import { generateInvoice, printInvoice } from "@/utils/invoiceGenerator";',
    );
    expect(inboxSource).toContain("printInvoice(selectedOrders");
    expect(inboxSource).not.toContain("printShippingLabels");
  });
});
