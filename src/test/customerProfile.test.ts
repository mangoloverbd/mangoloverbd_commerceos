import { describe, expect, it } from "vitest";
import { buildCustomers, customerKeyFor } from "../../server/customers.js";
import { buildCustomerProfile, parseCustomerId, validateCustomerContext, validateCustomerNote } from "../../server/customerProfile.js";

const phone = "01712345678";
const id = "11111111-1111-4111-8111-111111111111";
const order = (overrides = {}) => ({ id, phone, customer_name: "Rina", price: 500, status: "delivered", product: "Honey", address: "Dhaka", created_at: "2026-09-01T00:00:00Z", ...overrides });
const profile = (orders: ReturnType<typeof order>[], extra = {}) => buildCustomerProfile({ customerId: phone, orders, now: new Date("2026-09-30T00:00:00Z"), ...extra });

describe("customer profile identity", () => {
  it("does not merge phone-less people sharing a name", () => {
    const customers = buildCustomers({ orders: [order({ id: "a", phone: "" }), order({ id: "b", phone: "invalid" })] });
    expect(customers.map((customer) => customer.id)).toEqual(["order:a", "order:b"]);
    expect(customerKeyFor({ id, notes: "Phone: +880 1712-345678" }, "social")).toBe(phone);
  });
  it("accepts only canonical phone or stable row identities", () => {
    expect(parseCustomerId(phone)).toEqual({ phone, kind: null, rowId: null });
    expect(parseCustomerId(`social:${id}`)).toEqual({ phone: null, kind: "social", rowId: id });
    for (const value of ["name:Rina", "+8801712345678", "bad", "order:a", "x,org_id.eq.secret"]) expect(parseCustomerId(value)).toBeNull();
  });
  it("selects the latest nonempty name/address independent of input ordering", () => {
    const result = profile([order({ created_at: "2026-09-20T00:00:00Z", customer_name: "Rina R.", address: "Chattogram" }), order({ id: "old", created_at: "2026-08-01T00:00:00Z" })]);
    expect(result).toMatchObject({ name: "Rina R.", latestAddress: "Chattogram", firstOrderAt: "2026-08-01T00:00:00Z", lastOrderAt: "2026-09-20T00:00:00Z" });
    expect(result.addresses.map((address) => address.address)).toEqual(["Chattogram", "Dhaka"]);
    expect(profile([order({ phone: "01812345678" })])).toBeNull();
  });
});

describe("customer profile purchase and delivery facts", () => {
  it("separates total order value from fully delivered value", () => {
    const result = profile([order(), order({ id: "cancel", status: "cancelled", price: 900 }), order({ id: "partial", status: "partial_delivered", price: 200 }), order({ id: "active", status: "pending", price: 0 })]);
    expect(result.summary).toMatchObject({ totalOrders: 4, deliveredOrders: 1, cancelledOrders: 1, partialDeliveredOrders: 1, activeOrders: 1, orderValue: 1600, deliveredValue: 500, averageDeliveredValue: 500, missingAmounts: 0 });
  });
  it("does not count a pending return request as a completed return", () => {
    const result = profile([order({ return_status: "pending" }), order({ id: "returned", status: "returned" })]);
    expect(result.summary).toMatchObject({ returnedOrders: 1, pendingReturns: 1, deliveredOrders: 1, deliveredValue: 500 });
  });
  it("excludes completed returns from delivered value and purchase suggestions", () => {
    const result = profile([order({ courier_status: "delivered", return_status: "completed" })]);
    expect(result.summary).toMatchObject({ returnedOrders: 1, deliveredOrders: 0, deliveredValue: 0 });
    expect(result.products).toEqual([]);
  });
  it("uses explicit courier outcomes and excludes returned/cancelled/partial amounts", () => {
    const result = profile([order({ status: "processing", courier_status: "delivered" }), order({ id: "partial", courier_status: "partial_delivered" }), order({ id: "returned", return_status: "returned" })]);
    expect(result.summary).toMatchObject({ deliveredOrders: 1, partialDeliveredOrders: 1, returnedOrders: 1, deliveredValue: 500 });
  });
  it("does not treat courier approval-pending return states as completed returns", () => {
    const result = profile([order({ status: "returned", courier_status: "returned_approval_pending", fulfillment_status: "delivered" })]);
    expect(result.summary).toMatchObject({ returnedOrders: 0, deliveredOrders: 0, pendingReturns: 1, activeOrders: 1 });
  });
  it("keeps list names and risk aligned with the profile instead of older names and pending returns", () => {
    const rows = [order({ customer_name: "Rina New", created_at: "2026-09-20T00:00:00Z", return_status: "pending" }), order({ id: "old", customer_name: "Rina Old", created_at: "2026-08-01T00:00:00Z" })];
    expect(buildCustomers({ orders: rows })[0]).toMatchObject({ name: "Rina New", returnedOrders: 0, riskLevel: "low" });
  });
  it("recognizes the actual social inbox product field", () => {
    const result = buildCustomerProfile({ customerId: phone, inboxOrders: [{ id, notes: `Phone: ${phone}`, items: [{ product: "Honey", quantity: 2 }], status: "delivered", total_price: 500 }] });
    expect(result.products).toEqual([{ name: "Honey", quantity: 2, orders: 1 }]);
  });
  it("uses structured delivered items without double counting the product summary", () => {
    const result = profile([order({ product: "Honey x2, Mango x1" })], { orderItems: [{ order_id: id, product_name: "Honey", quantity: 2 }, { order_id: id, product_name: "Mango", quantity: 1 }] });
    expect(result.products).toEqual([{ name: "Honey", quantity: 2, orders: 1 }, { name: "Mango", quantity: 1, orders: 1 }]);
    expect(result.suggestion).toContain("Honey");
  });
  it("includes social notes, addresses and reliable conversation links", () => {
    const result = buildCustomerProfile({ customerId: phone, inboxOrders: [{ id, platform: "facebook", contact_name: "Rina", notes: "Phone: 01712345678\nAddress: Sylhet", items: [{ name: "Honey", quantity: 2 }], total_price: 800, status: "delivered", conversation_id: "conversation", created_at: "2026-09-01T00:00:00Z" }], now: new Date("2026-09-30T00:00:00Z") });
    expect(result).toMatchObject({ latestAddress: "Sylhet", sources: ["facebook"], summary: { deliveredValue: 800 } });
    expect(result.history[0]).toMatchObject({ kind: "social_order", conversationId: "conversation", trackingCode: null });
  });
  it("shows unknown recency and purchase frequency instead of invented zeroes", () => {
    const result = profile([order({ created_at: null, price: null, address: "", customer_name: "" })]);
    expect(result).toMatchObject({ name: "Unknown", latestAddress: null, firstOrderAt: null, summary: { daysSinceLastOrder: null, averagePurchaseIntervalDays: null, deliveredValue: null, averageDeliveredValue: null } });
  });
});

describe("staff context input", () => {
  it("normalizes manual tags and permits clearing a follow-up", () => {
    expect(validateCustomerContext({ tags: [" VIP ", "VIP", "Honey buyer"], followUpOn: null, followUpReason: "", expectedVersion: 0 })).toEqual({ tags: ["VIP", "Honey buyer"], followUpOn: null, followUpReason: "", expectedVersion: 0 });
  });
  it.each([
    { tags: [1], followUpOn: null, followUpReason: "", expectedVersion: 0 },
    { tags: [], followUpOn: "2026-02-30", followUpReason: "Call", expectedVersion: 0 },
    { tags: [], followUpOn: "2026-10-01", followUpReason: "", expectedVersion: 0 },
    { tags: [], followUpOn: null, followUpReason: "Call", expectedVersion: 0 },
    { tags: [], followUpOn: null, followUpReason: "", expectedVersion: -1 },
    { tags: [], followUpOn: null, followUpReason: "", expectedVersion: 0, org_id: "other" },
  ])("rejects invalid, inconsistent or client-scoped context: %j", (input) => {
    expect(() => validateCustomerContext(input)).toThrow();
  });
  it("requires an idempotent note id and nonempty bounded text", () => {
    expect(validateCustomerNote({ id, body: " Call after 6 pm " })).toEqual({ id, body: "Call after 6 pm" });
    for (const input of [{ id, body: " " }, { id: "bad", body: "Call" }, { id: [id], body: "Call" }, { id, body: "x".repeat(4001) }, { id, body: "Call", author: "Admin" }]) expect(() => validateCustomerNote(input)).toThrow();
  });
});
