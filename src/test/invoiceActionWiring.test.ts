import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { toInvoiceOrder } from "@/pages/InboxOrders";

describe("invoice and shipping-label action wiring", () => {
  it("prints A4 invoices and keeps shipping stickers as the Print action", () => {
    const dashboardSource = readFileSync(
      resolve(process.cwd(), "src/components/OrdersTable.tsx"),
      "utf8",
    );
    const inboxSource = readFileSync(
      resolve(process.cwd(), "src/pages/InboxOrders.tsx"),
      "utf8",
    );

    expect(dashboardSource).toContain(
      'const { printInvoice } = await import("@/utils/invoiceGenerator");',
    );
    expect(dashboardSource).toContain("printInvoice(selectedOrders, orgName)");
    expect(dashboardSource).not.toContain("generateInvoice(selectedOrders");
    expect(dashboardSource).toContain(
      'const { printShippingLabels } = await import("@/utils/shippingLabelPrinter");',
    );
    expect(dashboardSource).toContain("printShippingLabels(selectedOrders, orgName)");

    expect(inboxSource).toContain(
      'import { printInvoice } from "@/utils/invoiceGenerator";',
    );
    expect(inboxSource).toContain("printInvoice(selectedOrders, orgName)");
    expect(inboxSource).not.toContain("generateInvoice(selectedOrders");
    expect(inboxSource).toContain(
      'const { printShippingLabels } = await import("@/utils/shippingLabelPrinter");',
    );
    expect(inboxSource).toContain("printShippingLabels(selectedOrders, orgName)");
  });

  it("maps Inbox Orders into structured printable order data", () => {
    const mapped = toInvoiceOrder({
      id: "inbox-order-123456",
      platform: "facebook",
      contact_name: "Nusrat",
      contact_id: "contact-1",
      items: [
        { product: "Mango Honey", quantity: 2, variant_id: "variant-1" },
        { product: "Chia Seed", quantity: 1 },
      ],
      notes: "Phone: 01700 000000\nAddress: Dhanmondi, Dhaka\nCall before delivery",
      total_price: 1500,
      status: "confirmed",
      created_at: "2026-09-06T12:00:00.000Z",
      sent_to_courier: true,
      consignment_id: "CN-999",
      tracking_code: "TRACK-123",
      courier_status: "pending",
      courier_message: "Sent to Steadfast",
      delivery_rate: 80,
    });

    expect(mapped).toMatchObject({
      order_number: "IO-123456",
      customer_name: "Nusrat",
      phone: "01700 000000",
      address: "Dhanmondi, Dhaka",
      price: 1500,
      delivery_rate: 80,
      consignment_id: "CN-999",
      tracking_code: "TRACK-123",
      notes: "Call before delivery",
      items: [
        { product_name: "Mango Honey", variant_name: null, quantity: 2 },
        { product_name: "Chia Seed", variant_name: null, quantity: 1 },
      ],
    });
  });
});
