import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import QRCode from "qrcode";
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

  it("renders recipient details with the approved balanced-stack hierarchy", () => {
    const result = buildShippingLabelHtml([makeOrder()], "Mango Lover BD");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected printable label HTML");

    expect(result.html).toContain("<title></title>");
    expect(result.html).not.toContain("Mango Lover BD Shipping Label");
    expect(result.html).toContain("999");
    expect(result.html).toContain(
      '<div class="meta-field"><span>ORDER</span><strong>#ML567907</strong></div>',
    );
    expect(result.html).toContain(
      '<div class="meta-field"><span>COD</span><strong>৳1,580</strong></div>',
    );
    expect(result.html).toContain('<div class="customer-label">CUSTOMER</div>');
    expect(result.html).toContain('<div class="recipient-name">Rahim Uddin</div>');
    expect(result.html).toContain('<div class="recipient-phone">01700000000</div>');
    expect(result.html).not.toContain('class="recipient-contact');
    expect(result.html).not.toContain('class="recipient-address"');
    expect(result.html).not.toContain('class="address-label"');
    expect(result.html).not.toContain("ADDRESS");
    expect(result.html).not.toContain("Dhaka");
    expect(result.html).not.toContain('class="cod-box"');
    expect(result.html).not.toContain("DELIVER TO");
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
    expect(result.html).toContain("<tr><th>পণ্য</th><th>ওজন</th><th>পরিমাণ</th></tr>");
    expect(result.html).not.toContain("<th>Variant</th>");
    expect(result.html).not.toContain('<td class="variant">');
  });

  it("keeps a long customer name from pushing the phone off the label", () => {
    const customerName = "MD ABDUR RAHMAN CHOWDHURY";
    const result = buildShippingLabelHtml([makeOrder({ customer_name: customerName })]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected printable label HTML");

    expect(result.html).toContain(`<div class="recipient-name">${customerName}</div>`);
    expect(result.html).toContain('<div class="recipient-phone">01700000000</div>');
  });

  it("removes phone whitespace without otherwise rewriting the value", () => {
    const result = buildShippingLabelHtml([
      makeOrder({ phone: "+880 1700 000000" }),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected printable label HTML");

    expect(result.html).toContain('<div class="recipient-phone">+8801700000000</div>');
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
    expect(result.html).not.toContain("House &lt;7&gt; &amp; Road 2");
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

  it("releases unused summary height and fits five product rows", () => {
    const items = Array.from({ length: 5 }, (_, index) => ({
      product_name: `পণ্য ${index + 1} | Product ${index + 1}`,
      variant_name: "500 g pouch",
      quantity: 1,
    }));
    const result = buildShippingLabelHtml([makeOrder({ items })]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected printable label HTML");

    expect(result.html).toContain('<div class="label-summary">');
    expect(result.html).toContain(".label-summary { flex: 0 0 auto; }");
    expect(result.html).not.toContain("min-height: 1.58in");
    expect(result.html).toContain("tbody tr { height: 0.29in; }");
    expect(result.html.match(/<td class="product">পণ্য \d<\/td>/g)).toHaveLength(5);
  });

  it("prints only the Bengali product name, a clean weight and a Bengali quantity", () => {
    const result = buildShippingLabelHtml([
      makeOrder({
        items: [
          { product_name: "লিচু ফুলের মধু | Litchi Flower Honey", variant_name: '{"size": "১ কেজি"}', quantity: 12 },
          { product_name: "Honey", variant_name: "0.5KG", quantity: 1 },
        ],
      }),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected printable label HTML");

    expect(result.html).toContain('<td class="product">লিচু ফুলের মধু</td>');
    expect(result.html).not.toContain("Litchi Flower Honey");
    expect(result.html).toContain('<td class="weight">১ কেজি</td>');
    expect(result.html).not.toContain("&quot;size&quot;");
    expect(result.html).toContain('<td class="quantity">১২</td>');
    expect(result.html).toContain('<td class="product">Honey</td>');
    expect(result.html).toContain('<td class="weight">0.5KG</td>');
    expect(result.html).toContain('<td class="quantity">১</td>');
    expect(result.html).toContain(
      "td.weight { white-space: nowrap; overflow: hidden; font-size: 14px; font-weight: 800; }",
    );
  });

  it("falls back to legacy merchandise fields", () => {
    const result = buildShippingLabelHtml([
      makeOrder({ items: [], product: "3x Dried Mango", quantity: 3 }),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected printable label HTML");

    expect(result.html).toContain("Dried Mango");
    expect(result.html).toContain('<td class="quantity">৩</td>');
    expect(result.html).toContain('<td class="weight">—</td>');
  });
});

describe("shipping label CN QR code", () => {
  const html = () => {
    const result = buildShippingLabelHtml([makeOrder({ consignment_id: 314000072 })]);
    if (!result.ok) throw new Error("Expected printable label HTML");
    return result.html;
  };

  it("replaces the thin line barcode with a QR code", () => {
    expect(html()).toMatch(/<svg[^>]+class="qr"[^>]+aria-label="CN QR code 314000072"/);
    expect(html()).not.toContain('class="barcode"');
  });

  it("encodes only the CN, square by square, with a four-module quiet zone", () => {
    const { modules } = QRCode.create("314000072", { errorCorrectionLevel: "M" });
    const expected: string[] = [];
    for (let y = 0; y < modules.size; y += 1) {
      for (let x = 0; x < modules.size; x += 1) {
        if (modules.get(y, x)) expected.push(`M${x + 4} ${y + 4}h1v1h-1z`);
      }
    }

    expect(html()).toContain(`viewBox="0 0 ${modules.size + 8} ${modules.size + 8}"`);
    expect(html()).toContain(`<path d="${expected.join("")}"/>`);
  });

  it("prints the QR large and keeps the CN readable beside it", () => {
    expect(html()).toContain(".qr { display: block; width: 0.9in; height: 0.9in; }");
    // The CN size must come after the shared .meta-field strong size or it is overridden.
    expect(html().indexOf(".cn-field strong { font-size: 19px;")).toBeGreaterThan(
      html().indexOf(".meta-field strong {"),
    );
    expect(html()).toContain(
      '<div class="meta-field cn-field"><span>CN</span><strong>314000072</strong></div>',
    );
  });
});

describe("shipping label action wiring", () => {
  it("routes both order-screen Print actions to shipping labels", () => {
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
      'const { printShippingLabels } = await import("@/utils/shippingLabelPrinter");',
    );
    expect(inboxSource).toContain("printShippingLabels(selectedOrders, orgName)");
  });
});
