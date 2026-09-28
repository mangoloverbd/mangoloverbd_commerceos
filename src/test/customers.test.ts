import { describe, expect, it } from "vitest";
import {
  buildCustomers,
  customerPhoneCandidates,
  detectCustomerOrderSource,
  findCustomerOrderByPhone,
  normalizeCustomerPhone,
} from "../../server/customers.js";

describe("customer intelligence aggregation", () => {
  it("normalizes Bangladeshi customer phone numbers for identity matching", () => {
    expect(normalizeCustomerPhone("+880 1712-345678")).toBe("01712345678");
    expect(normalizeCustomerPhone("8801812345678")).toBe("01812345678");
    expect(normalizeCustomerPhone("01912345678")).toBe("01912345678");
    expect(normalizeCustomerPhone("not-a-phone")).toBe("");
  });

  it("builds the supported stored forms for a customer lookup", () => {
    expect(customerPhoneCandidates("01712345678")).toEqual([
      "01712345678",
      "8801712345678",
      "+8801712345678",
    ]);
    expect(customerPhoneCandidates("+880 1712-345678")).toEqual([
      "01712345678",
      "8801712345678",
      "+8801712345678",
    ]);
    expect(customerPhoneCandidates("not-a-phone")).toEqual([]);
  });

  it("finds the newest matching order when a stored phone contains formatting", () => {
    const rows = [
      { id: "newest-other", phone: "01812-345678" },
      { id: "newest-match", phone: "+880 1712-345678" },
      { id: "older-match", phone: "01712345678" },
    ];

    expect(findCustomerOrderByPhone(rows, "01712345678")).toEqual(rows[1]);
    expect(findCustomerOrderByPhone(rows, "01912345678")).toBeNull();
  });

  it("uses the order's own source, the same list the order form offers", () => {
    expect(detectCustomerOrderSource({ source: "website" }, "order")).toBe("website");
    expect(detectCustomerOrderSource({ source: "custom_store" }, "order")).toBe("website");
    expect(detectCustomerOrderSource({ source: "storefront" }, "order")).toBe("website");
    expect(detectCustomerOrderSource({ source: "Telesales" }, "order")).toBe("telesales");
    expect(detectCustomerOrderSource({ source: "phone" }, "order")).toBe("phone");
    expect(detectCustomerOrderSource({ source: "upsell" }, "order")).toBe("upsell");
    expect(detectCustomerOrderSource({ source: "facebook", shopify_order_id: 12345 }, "order")).toBe("facebook");
    expect(detectCustomerOrderSource({ source: null, shopify_order_id: 12345 }, "order")).toBe("manual_other");
    expect(detectCustomerOrderSource({ platform: "facebook" }, "social")).toBe("facebook");
    expect(detectCustomerOrderSource({ platform: "tiktok" }, "social")).toBe("manual_other");
  });

  it("picks the source a customer ordered through most, breaking ties by the latest order", () => {
    const order = (id: string, source: string, createdAt: string) => ({ id, source, phone: "01712345678", customer_name: "Rina", price: "500", status: "confirmed", created_at: createdAt });
    const [mostly] = buildCustomers({
      orders: [
        order("a", "facebook", "2026-07-01T10:00:00Z"),
        order("b", "facebook", "2026-07-02T10:00:00Z"),
        order("c", "telesales", "2026-07-03T10:00:00Z"),
      ],
    });
    expect(mostly.primarySource).toBe("facebook");
    expect(mostly.sources).toEqual(["facebook", "telesales"]);

    const [tied] = buildCustomers({
      orders: [order("a", "facebook", "2026-07-01T10:00:00Z"), order("b", "phone", "2026-07-05T10:00:00Z")],
    });
    expect(tied.primarySource).toBe("phone");
  });

  it("merges a customer's orders across sources into one profile", () => {
    const customers = buildCustomers({
      now: new Date("2026-07-09T00:00:00Z"),
      orders: [
        {
          id: "facebook-1",
          source: "facebook",
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
      primarySource: "website",
      sources: ["facebook", "website"],
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
