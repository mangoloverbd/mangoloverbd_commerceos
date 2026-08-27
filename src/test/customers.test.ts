import { describe, expect, it } from "vitest";
import {
  buildCustomers,
  detectCustomerOrderSource,
  normalizeCustomerPhone,
} from "../../server/customers.js";

describe("customer intelligence aggregation", () => {
  it("normalizes Bangladeshi customer phone numbers for identity matching", () => {
    expect(normalizeCustomerPhone("+880 1712-345678")).toBe("01712345678");
    expect(normalizeCustomerPhone("8801812345678")).toBe("01812345678");
    expect(normalizeCustomerPhone("01912345678")).toBe("01912345678");
    expect(normalizeCustomerPhone("not-a-phone")).toBe("");
  });

  it("detects Shopify, custom website webhook, manual, and social sources", () => {
    expect(detectCustomerOrderSource({ source: "custom_store" }, "order")).toBe("custom_website");
    expect(detectCustomerOrderSource({ platform: "facebook" }, "social")).toBe("facebook");
    expect(detectCustomerOrderSource({ shopify_order_id: 12345 }, "order")).toBe("shopify");
    expect(detectCustomerOrderSource({ shopify_order_id: -12345, order_number: "#1002" }, "order")).toBe("custom_website");
    expect(detectCustomerOrderSource({ shopify_order_id: -12345, order_number: "#M12" }, "order")).toBe("manual");
  });

  it("merges Shopify and custom website orders into one source-aware customer", () => {
    const customers = buildCustomers({
      now: new Date("2026-07-09T00:00:00Z"),
      orders: [
        {
          id: "shopify-1",
          shopify_order_id: 111,
          order_number: "#1001",
          customer_name: "Nadia Rahman",
          phone: "+8801712345678",
          product: "Serum",
          price: "1500",
          status: "confirmed",
          created_at: "2026-07-01T10:00:00Z",
        },
        {
          id: "custom-1",
          source: "custom_store",
          shopify_order_id: -999,
          order_number: "#1002",
          customer_name: "Nadia R.",
          phone: "01712-345678",
          product: "Moisturizer",
          price: "2100",
          status: "cancelled",
          created_at: "2026-07-03T10:00:00Z",
        },
      ],
      inboxOrders: [],
    });

    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({
      name: "Nadia R.",
      phone: "01712345678",
      totalOrders: 2,
      totalSpent: 3600,
      primarySource: "custom_website",
      sources: ["shopify", "custom_website"],
    });
    expect(customers[0].segments).toContain("repeat_buyer");
    expect(customers[0].riskLevel).toBe("medium");
    expect(customers[0].lifecycleStage).toBe("repeat");
    expect(customers[0].campaignSegments).toEqual(expect.arrayContaining(["repeat_upsell", "cod_guardrail"]));
  });

  it("includes social inbox orders and extracts phone numbers from notes", () => {
    const customers = buildCustomers({
      orders: [],
      inboxOrders: [
        {
          id: "social-1",
          platform: "whatsapp",
          contact_name: "Arif",
          items: [{ name: "T-shirt", quantity: 2 }],
          total_price: "1800",
          status: "pending",
          notes: "Phone: 01812345678\nAddress: Dhaka",
          created_at: "2026-07-02T10:00:00Z",
        },
      ],
    });

    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({
      name: "Arif",
      phone: "01812345678",
      totalSpent: 1800,
      primarySource: "whatsapp",
      sources: ["whatsapp"],
    });
    expect(customers[0].timeline[0]).toMatchObject({ source: "whatsapp", kind: "social_order" });
  });

  it("marks dormant VIP customers for win-back and loyalty campaigns", () => {
    const customers = buildCustomers({
      now: new Date("2026-07-09T00:00:00Z"),
      orders: [
        {
          id: "vip-1",
          shopify_order_id: 101,
          order_number: "#101",
          customer_name: "Sadia",
          phone: "01711111111",
          product: "Premium Saree",
          price: "12000",
          status: "delivered",
          created_at: "2026-04-01T10:00:00Z",
        },
        {
          id: "vip-2",
          shopify_order_id: 102,
          order_number: "#102",
          customer_name: "Sadia",
          phone: "01711111111",
          product: "Jewelry Set",
          price: "8000",
          status: "delivered",
          created_at: "2026-04-05T10:00:00Z",
        },
      ],
    });

    expect(customers[0]).toMatchObject({
      lifecycleStage: "dormant",
      totalSpent: 20000,
    });
    expect(customers[0].campaignSegments).toEqual(expect.arrayContaining(["win_back", "vip_loyalty", "repeat_upsell"]));
  });
});
