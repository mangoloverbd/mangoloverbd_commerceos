import { describe, expect, it, vi } from "vitest";
import { database, handlers, http, link, orgId, signedHeaders, uuid, foreignOrg } from "./campaignHandlerHarness";
import { assessOrderRisk } from "../../server/risk/pipeline.js";
import { createProtectionReview } from "../../server/orderProtectionStore.js";
import { buildPersonalDataScrubPatch, parseAbandonedCheckoutCapture, hashAbandonedCheckoutDraftKey } from "../../server/abandonedCheckouts.js";
import { storefrontVisibleVariants } from "../../server/publicCatalog.js";

const body = { customerName: "Customer", phone: "01712345678", address: "House 12, Road 8, Dhaka", items: [{ variantId: uuid(20), quantity: 2 }], abandonedCheckoutDraftKey: uuid(30), campaign_link_id: uuid(999), campaign_attributed_at: "2000-01-01T00:00:00Z" };
const captureBody = { draftKey: uuid(30), source: "storefront", sourcePath: "/checkout", customerName: "Customer", phone: "01712345678", address: "Dhaka", items: [{ productName: "Honey", variantName: null, quantity: 2, unitPrice: 100 }], subtotal: 200, deliveryRate: 0, total: 200 };
const click = (id = uuid(40), clicked_at = new Date(Date.now() - 1000).toISOString()) => ({ id, org_id: orgId, link_id: link.id, clicked_at, is_bot: false });
function fixture(extra: Record<string, unknown> = {}, seed: Record<string, Record<string, unknown>[]> = {}) {
  const db = database({ campaign_links: [link], campaign_link_clicks: [click()], product_variants: [{ id: uuid(20), org_id: orgId, product_id: uuid(21), stock_quantity: 100, attributes: {}, price_adjustment: 0 }], products: [{ id: uuid(21), org_id: orgId, name: "Honey", selling_price: 100, published: true }], ...seed });
  const risk = vi.fn(async () => ({ enforced: false, decision: "ALLOW", attemptId: null }));
  const harness = handlers(db, {
    PROTECTION_MODE_SETTING_SUFFIX: "order_protection_mode", getSettings: async () => ({}), resolveProtectionMode: () => "active", allowOrderSubmission: async () => true,
    redisClient: null, getTrustedRequestIp: () => "203.0.113.5", normalizeLandingPagePath: () => null,
    assessOrderRisk: risk, finalizeOrderRisk: async () => {}, storefrontVisibleVariants, resolveOrderRouting: async () => ({ warehouseId: null, weightKg: null, resolvedItems: [{}, {}] }),
    calculateStorefrontShippingCost: () => ({ cost: 0 }), cartHasFreeDeliveryProduct: () => false,
    getNextManualOrderNumber: async () => 1001, purgeProductCache: async () => {}, checkStorefrontOrderFraud: () => {},
    recordOrderActivity: async () => {}, buildDetailedActivityEvent: () => ({}), sendBulkSms: async () => {},
    customStoreApiKeyFromRequest: () => "server-key", resolveCustomStoreOrgId: async () => orgId, allowAbandonedCheckoutCapture: async () => true, recordAbandonedRiskLinks: async () => {},
    resolveAbandonedCatalogIds: async () => [{ productId: uuid(21), variantId: uuid(20) }],
    buildAttributionPatch: () => ({}), prepareStatusEvent: () => null, recordStatusEvent: async () => {}, buildStatusEvent: () => ({}),
    getOrderApprovalDetailsError: () => null, enrichOrderItems: async (_db: unknown, _org: unknown, items: unknown) => items, isOrderDispatched: () => false,
    requireOrderProtectionStaff: async () => ({ user: { id: uuid(1) }, supabase: db, orgId }),
    sendError: (res: { status: (status: number) => { json: (body: unknown) => unknown } }, error: { statusCode?: number; message: string }) => res.status(error.statusCode || 500).json({ error: error.message }),
    ...extra,
  });
  harness.load(["ABANDONED_CHECKOUT_DASHBOARD_FIELDS", "handlePublicHandleOrderSubmit", "persistAbandonedCheckoutCapture", "recoverCapturedCheckoutForOrder", "linkHeldReviewToAbandonedCheckout", "approveHeldProtectionReview", "closeHeldReviewForConvertedCheckout"], [
    'app.post("/api/public/v1/:handle/orders"', 'app.post("/api/custom-orders/abandoned-checkouts"', 'app.post("/api/abandoned-checkouts/:id/convert"', 'app.get("/api/orders/:id",',
    'app.patch("/api/order-protection/reviews/:id"',
  ]);
  return { ...harness, db, risk };
}
describe("campaign attribution through actual purchase HTTP handlers", () => {
  it("clicks then orders locally with verified context, server time and separate risk argument", async () => {
    const { app, db, risk } = fixture();
    const headers = { ...signedHeaders(), "x-mlbd-campaign-request-id": uuid(45) };
    const clicked = await http(app, "POST", `/api/public/v1/mangolover/campaign-links/${link.slug}/clicks`, {}, headers);
    const result = await http(app, "POST", "/api/public/v1/mangolover/orders", body, { ...signedHeaders(), "x-mlbd-campaign-click-id": clicked.body.clickId });
    expect(result.status).toBe(200);
    const order = db.tables.orders[0];
    expect(order).toMatchObject({ campaign_link_id: link.id, campaign_click_id: clicked.body.clickId, source: "website", abandoned_draft_key_hash: hashAbandonedCheckoutDraftKey(uuid(30)) });
    expect(order.campaign_attributed_at).not.toBe(body.campaign_attributed_at);
    expect(risk).toHaveBeenCalledWith(expect.objectContaining({ campaignAttribution: { campaign_link_id: link.id, campaign_click_id: clicked.body.clickId, campaign_attributed_at: order.campaign_attributed_at } }));
  });
  it("uses a draft fallback only with no current header and never resurrects an explicitly expired newer click", async () => {
    for (const supplied of [false, true]) {
      const old = click(uuid(41), new Date(Date.now() - 31 * 86400000).toISOString());
      const { app, db } = fixture({}, { campaign_link_clicks: [click(), old], abandoned_checkouts: [{ id: uuid(31), org_id: orgId, draft_key: uuid(30), status: "open", expires_at: new Date(Date.now() + 86400000).toISOString(), campaign_click_id: uuid(40) }] });
      const headers = { ...signedHeaders(), ...(supplied ? { "x-mlbd-campaign-click-id": old.id } : {}) };
      expect((await http(app, "POST", "/api/public/v1/mangolover/orders", body, headers)).status).toBe(200);
      expect(db.tables.orders[0].campaign_click_id).toBe(supplied ? undefined : uuid(40));
    }
  });
  it("malformed, forged, bot, foreign and tracking outage remove marketing only; risk always runs", async () => {
    for (const scenario of ["malformed", "untrusted", "bot", "foreign", "offline", "timeout"]) {
      const { app, db, risk } = fixture();
      if (scenario === "bot") db.tables.campaign_link_clicks[0].is_bot = true;
      if (scenario === "foreign") db.tables.campaign_link_clicks[0].org_id = foreignOrg;
      if (scenario === "offline") db.failures.campaign_link_clicks = { message: "offline" };
      if (scenario === "timeout") db.hanging.add("campaign_link_clicks");
      const headers = { ...(scenario === "untrusted" ? {} : signedHeaders()), "x-mlbd-campaign-click-id": scenario === "malformed" ? "invalid" : uuid(40) };
      const started = Date.now();
      expect((await http(app, "POST", "/api/public/v1/mangolover/orders", body, headers)).status).toBe(200);
      expect(Date.now() - started).toBeLessThan(1200);
      expect(db.tables.orders[0]).not.toHaveProperty("campaign_click_id"); expect(risk).toHaveBeenCalledOnce();
    }
  });
  it("strict capture ignores malformed optional marketing before validation and serialized RPC preserves the newest click", async () => {
    for (const invalid of ["broken", { spoof: true }, 123]) expect(parseAbandonedCheckoutCapture({ ...captureBody, campaignClickId: invalid }).phone).toBe(captureBody.phone);
    const newer = click(uuid(41)); const older = click(uuid(40), new Date(Date.now() - 100000).toISOString());
    const { app, db } = fixture({}, { campaign_link_clicks: [newer, older] });
    for (const clickId of [newer.id, older.id, "bad"]) {
      const result = await http(app, "POST", "/api/custom-orders/abandoned-checkouts", { ...captureBody, campaignClickId: clickId }, { ...signedHeaders(), "x-mlbd-campaign-click-id": clickId });
      expect(result.status).toBe(201);
    }
    expect(db.tables.abandoned_checkouts[0].campaign_click_id).toBe(newer.id);
    expect(db.calls.filter(call => call.table === "attribute_campaign_checkout")).toHaveLength(2);
    Object.assign(db.tables.abandoned_checkouts[0], buildPersonalDataScrubPatch());
    expect(db.tables.abandoned_checkouts[0].campaign_click_id).toBe(newer.id);
  });
  it("staff conversion revalidates the stored click at conversion, retains quantities and durable hash", async () => {
    for (const expired of [false, true]) {
      const { app, db } = fixture({}, { campaign_link_clicks: [click(uuid(40), new Date(Date.now() - (expired ? 31 : 1) * 86400000).toISOString())], abandoned_checkouts: [{ id: uuid(31), org_id: orgId, draft_key: uuid(30), status: "open", expires_at: new Date(Date.now() + 86400000).toISOString(), campaign_click_id: uuid(40), campaign_link_id: link.id, cart: captureBody.items, phone: body.phone, customer_name: body.customerName, address: body.address, delivery_rate: 0 }] });
      const result = await http(app, "POST", `/api/abandoned-checkouts/${uuid(31)}/convert`, { status: "pending" });
      expect(result.status).toBe(201); expect(db.tables.orders[0].campaign_click_id).toBe(expired ? undefined : uuid(40));
      expect(db.tables.orders[0].abandoned_draft_key_hash).toBe(hashAbandonedCheckoutDraftKey(uuid(30)));
      expect(db.tables.order_items[0].quantity).toBe(2);
    }
  });
  it("holds pass trusted attribution into the original review insert and approval after 30 days preserves it/linkage", async () => {
    const held = vi.fn(async (input: { campaignAttribution?: unknown }) => {
      await createProtectionReview({ supabase: db, review: { orgId, route: "public_v1", customerName: body.customerName, phone: body.phone, address: body.address, items: body.items, score: 50, reasonCodes: [], campaignAttribution: input.campaignAttribution } });
      return { enforced: true, decision: "HOLD", reviewId: db.tables.order_protection_reviews[0].id };
    });
    const { app, db } = fixture({ assessOrderRisk: held }, { abandoned_checkouts: [{ id: uuid(31), org_id: orgId, draft_key: uuid(30), status: "open", expires_at: new Date(Date.now() + 86400000).toISOString() }] });
    expect((await http(app, "POST", "/api/public/v1/mangolover/orders", body, { ...signedHeaders(), "x-mlbd-campaign-click-id": uuid(40) })).status).toBe(202);
    expect(db.tables.orders).toBeUndefined();
    const review = db.tables.order_protection_reviews[0];
    expect(review.campaign_click_id).toBe(uuid(40)); expect(review.abandoned_checkout_id).toBe(uuid(31));
    review.campaign_attributed_at = new Date(Date.now() - 40 * 86400000).toISOString();
    const approved = await http(app, "PATCH", `/api/order-protection/reviews/${review.id}`, { action: "approve" });
    expect(approved.status).toBe(200);
    expect(db.tables.orders[0]).toMatchObject({ campaign_click_id: uuid(40), campaign_attributed_at: review.campaign_attributed_at, abandoned_checkout_id: uuid(31), abandoned_draft_key_hash: hashAbandonedCheckoutDraftKey(uuid(30)) });
  });
  it("late capture links by durable draft hash without changing frozen attribution; order detail exposes only campaign summary", async () => {
    const { app, db } = fixture();
    await http(app, "POST", "/api/public/v1/mangolover/orders", body, { ...signedHeaders(), "x-mlbd-campaign-click-id": uuid(40) });
    const original = { ...db.tables.orders[0] };
    await http(app, "POST", "/api/custom-orders/abandoned-checkouts", captureBody, signedHeaders());
    expect(db.tables.orders[0].abandoned_checkout_id).toBe(db.tables.abandoned_checkouts[0].id);
    expect(db.tables.orders[0].campaign_click_id).toBe(original.campaign_click_id);
    const detail = await http(app, "GET", `/api/orders/${original.id}`);
    expect(detail.status).toBe(200); expect(detail.body.campaign).toEqual({ name: link.name, slug: link.slug, channel: link.channel });
  });
  it("rejects a Merchant-Suite-only variant at public checkout without creating an order or touching stock", async () => {
    const hidden = { id: uuid(20), org_id: orgId, product_id: uuid(21), stock_quantity: 100, attributes: { size: "500g" }, price_adjustment: 0, storefront_visible: false };
    const { app, db } = fixture({}, { product_variants: [hidden] });
    const result = await http(app, "POST", "/api/public/v1/mangolover/orders", body, signedHeaders());
    expect(result.status).toBe(400);
    expect(db.tables.orders ?? []).toHaveLength(0);
    expect(db.tables.product_variants[0].stock_quantity).toBe(100);
  });
});

it("the real risk pipeline passes only the separate trusted attribution to durable review storage", async () => {
  const db = database(); const attribution = { campaign_link_id: link.id, campaign_click_id: uuid(40), campaign_attributed_at: new Date().toISOString() };
  const result = await assessOrderRisk({ orgId, route: "public_v1", body: { ...body, website: "filled trap" }, headers: {}, campaignAttribution: attribution,
    deps: { supabase: db, redis: null, secret: "protection-hash-secret-test", contextSecret: process.env.STOREFRONT_CONTEXT_SECRET, envMode: "active", verifyTurnstile: async () => ({ ok: true }) } });
  expect(result.decision).toBe("HOLD"); expect(db.tables.order_protection_reviews[0]).toMatchObject(attribution);
  expect(db.tables.order_protection_reviews[0].abandoned_draft_key_hash).toBe(hashAbandonedCheckoutDraftKey(body.abandonedCheckoutDraftKey));
});
it('approval retains a durable draft hash even when no checkout was captured before the hold', async () => {
  const hash = hashAbandonedCheckoutDraftKey(uuid(30));
  const { app, db } = fixture({}, { order_protection_reviews: [{ id: uuid(50), org_id: orgId, status: 'on_hold', source_route: 'public_v1',
    phone: body.phone, customer_name: body.customerName, address: body.address, items: body.items, abandoned_draft_key_hash: hash,
    campaign_link_id: link.id, campaign_click_id: uuid(40), campaign_attributed_at: new Date().toISOString() }] });
  expect((await http(app, 'PATCH', `/api/order-protection/reviews/${uuid(50)}`, { action: 'approve' })).status).toBe(200);
  expect(db.tables.orders[0].abandoned_draft_key_hash).toBe(hash);
  await http(app, 'POST', '/api/custom-orders/abandoned-checkouts', captureBody, signedHeaders());
  expect(db.tables.orders[0].abandoned_checkout_id).toBe(db.tables.abandoned_checkouts[0].id);
});
