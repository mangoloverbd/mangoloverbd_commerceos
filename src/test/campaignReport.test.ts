import { describe, expect, it, vi } from "vitest";
import { buildCampaignReport, classifyCampaignOutcome, redactCampaignFinancials, resolveCampaignReportRequest } from "../../server/campaignReport.js";
import { buildBusinessReport } from "../../server/businessReport.js";

const org = "33333333-3333-4333-8333-333333333333";
const a = { id: "22222222-2222-4222-8222-222222222222", org_id: org, name: "Reel A", slug: "reel-a", channel: "facebook", destination_path: "/step/mango", archived_at: null };
const b = { ...a, id: "44444444-4444-4444-8444-444444444444", name: "Reel B", slug: "reel-b" };
const click = (id = "c1", link = a, clicked_at = "2026-09-29T10:00:00Z", visitor_hash: string | null = "visitor") => ({ id, org_id: org, link_id: link.id, clicked_at, is_bot: false, visitor_hash });
const order = (id = "o1", changes = {}) => ({ id, org_id: org, campaign_link_id: a.id, campaign_click_id: "c1", campaign_attributed_at: "2026-10-02T00:00:00Z", created_at: "2026-10-02T00:00:00Z", source: "website", status: "delivered", price: 1000, delivery_rate: 60, courier_fee: 100, product: "1x Mango", ...changes });
const products = [{ id: "p1", org_id: org, name: "Mango", cog: 400 }];
const request = { range: { from: "2026-09-29", to: "2026-09-30" }, since: "2026-09-28T18:00:00.000Z", until: "2026-09-30T18:00:00.000Z", as_of: "2026-10-03T10:00:00.000Z" };
const report = (changes = {}) => buildCampaignReport({ links: [a, b], clicks: [click()], checkouts: [], orders: [order()], unattributedOrders: [], checkoutOrderLinks: [], orderItems: [], products, request, ...changes });

describe("click-date request", () => {
  it("defaults to the Business Report UI's current Dhaka day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T19:00:00Z"));
    try {
      expect(resolveCampaignReportRequest()).toMatchObject({ range: { from: "2026-10-03", to: "2026-10-03" }, since: "2026-10-02T18:00:00.000Z", until: "2026-10-03T18:00:00.000Z", date_basis: "click" });
    } finally { vi.useRealTimers(); }
  });
  it("converts inclusive dates to half-open Dhaka intervals", () => {
    expect(resolveCampaignReportRequest({ from: "2026-09-29", to: "2026-09-30" })).toMatchObject({ ...request, as_of: expect.any(String) });
  });
  it.each([
    { from: "2026-09-29" }, { to: "2026-09-29" }, { from: "2026-02-30", to: "2026-03-01" },
    { from: "2026-09-30", to: "2026-09-29" }, { from: "2024-01-01", to: "2025-01-01" },
    { from: "2099-01-01", to: "2099-01-01" }, { from: [], to: [] },
  ])("rejects invalid or unbounded query %j", (query) => {
    expect(() => resolveCampaignReportRequest(query)).toThrow();
  });
  it("accepts 366 days, not 367", () => {
    expect(resolveCampaignReportRequest({ from: "2024-01-01", to: "2024-12-31" }).range.to).toBe("2024-12-31");
    expect(() => resolveCampaignReportRequest({ from: "2024-01-01", to: "2025-01-01" })).toThrow();
  });
});

describe("campaign outcome adapter", () => {
  it.each([
    [{ status: "delivered", return_status: "completed" }, "returned", null, null],
    [{ status: "delivered", return_status: "returned" }, "returned", null, null],
    [{ status: "confirmed", courier_status: "returned" }, "returned", null, null],
    [{ status: "confirmed", courier_status: "return_received" }, "returned", null, null],
    [{ status: "cancelled" }, "cancelled", null, null],
    [{ status: "pending", courier_status: "cancelled" }, "cancelled", null, null],
    [{ status: "delivered", courier_status: "delivered_approval_pending" }, "confirmed", null, null],
    [{ status: "partial_delivered_approval_pending" }, "pending", null, null],
    [{ status: "confirmed", return_status: "pending" }, "confirmed", null, null],
    [{ status: "pending", courier_status: "return_approval_pending" }, "pending", null, null],
    [{ status: "returned", courier_status: "return_approval_pending" }, "pending", null, null],
    [{ status: "confirmed", courier_status: "return_requested" }, "confirmed", null, null],
    [{ status: "delivered", return_status: "approval_pending" }, "confirmed", null, null],
    [{ status: "delivered" }, "delivered", "full", null],
    [{ status: "confirmed", courier_status: "partial_delivered" }, "delivered", "partial", "partial_delivery_amount_unknown"],
    [{ status: "confirmed" }, "confirmed", null, null],
    [{ status: "processing" }, "confirmed", null, null],
    [{ status: "pending" }, "pending", null, null],
  ])("classifies %j without converting unresolved markers into terminal revenue", (input, outcome, delivery_kind, amount_incomplete_reason) => {
    expect(classifyCampaignOutcome(input)).toEqual({ outcome, delivery_kind, amount_incomplete_reason });
  });
});

describe("campaign counting and date scope", () => {
  it("counts converted click IDs, not orders divided by clicks", () => {
    const result = report({ clicks: Array.from({ length: 10 }, (_, i) => click(`c${i + 1}`)), orders: [order(), order("o2")] });
    expect(result.rows[0]).toMatchObject({ clicks: 10, orders: 2, captured_checkouts: 2, converted_clicks: 1, click_to_order: 0.1 });
    expect(result.totals.click_to_order).toBe(0.1);
    expect(result.rows[1].click_to_order).toBeNull();
    expect(result.rows[1].order_to_delivered).toBeNull();
  });
  it("deduplicates recovered drafts by ID and by durable hash across the whole workspace", () => {
    const checkouts = [
      { id: "d1", org_id: org, campaign_link_id: a.id, campaign_click_id: "c1", draft_key: "draft1", status: "recovered" },
      { id: "d2", org_id: org, campaign_link_id: a.id, campaign_click_id: "c1", draft_key: "draft2", status: "dismissed" },
      { id: "d3", org_id: org, campaign_link_id: a.id, campaign_click_id: "c1", draft_key: "draft3", status: "expired" },
    ];
    const result = report({ checkouts: [...checkouts, checkouts[2]], orders: [order("o1", { abandoned_checkout_id: "d1" })], checkoutOrderLinks: [{ org_id: org, abandoned_draft_key_hash: "hash2" }],
      // d2 matches an order outside the selected click group using its retained hash.
    });
    expect(result.rows[0].captured_checkouts).toBe(3);
    const byHash = report({ checkouts: checkouts.map((d) => ({ ...d, draft_key_hash: d.id === "d2" ? "hash2" : null })), orders: [order("o1", { abandoned_checkout_id: "d1" })], checkoutOrderLinks: [{ org_id: org, abandoned_draft_key_hash: "hash2" }] });
    expect(byHash.rows[0].captured_checkouts).toBe(2);
  });
  it("uses the final order attribution when A's draft becomes B's order", () => {
    const result = report({ clicks: [click(), click("cb", b)], orders: [order("ob", { campaign_link_id: b.id, campaign_click_id: "cb", abandoned_checkout_id: "d1" })], checkouts: [{ id: "d1", org_id: org, campaign_link_id: a.id, campaign_click_id: "c1" }] });
    expect(result.rows[0]).toMatchObject({ captured_checkouts: 0, orders: 0 });
    expect(result.rows[1]).toMatchObject({ captured_checkouts: 1, orders: 1 });
  });
  it("uses the SHA256 of draft_key for late capture reconciliation", () => {
    const result = report({ checkouts: [{ id: "late", org_id: org, campaign_link_id: a.id, campaign_click_id: "c1", draft_key: "55555555-5555-4555-8555-555555555555" }], orders: [order("o1", { abandoned_draft_key_hash: "fbfe405ca65f6275b98fdeb81ceb4df23903cb9138435c28458e161b27313455" })] });
    expect(result.rows[0].captured_checkouts).toBe(1);
  });
  it("keeps September clicks' October orders in September and plots orders on click day", () => {
    const result = report();
    expect(result.totals.orders).toBe(1);
    expect(result.daily[0]).toMatchObject({ day: "2026-09-29", clicks: 1, orders: 1 });
    expect(result.daily[1]).toMatchObject({ day: "2026-09-30", clicks: 0, orders: 0 });
    const october = report({ request: { ...request, range: { from: "2026-10-01", to: "2026-10-03" }, since: "2026-09-30T18:00:00Z", until: "2026-10-03T18:00:00Z" } });
    expect(october.totals.orders).toBe(0);
    expect(result.meta).toMatchObject({ date_basis: "click", order_series_label: "Orders from these clicks", provisional: true });
  });
  it("excludes bots and mismatched associations, retaining archived link activity", () => {
    const result = report({ links: [{ ...a, archived_at: "2026-09-01T00:00:00Z" }], clicks: [click(), { ...click("bot"), is_bot: true }, { ...click("cross"), org_id: "other" }], orders: [order(), order("bot-order", { campaign_click_id: "bot" }), order("cross-order", { org_id: "other" }), order("mismatch", { campaign_link_id: b.id })] });
    expect(result.totals).toMatchObject({ clicks: 1, orders: 1, captured_checkouts: 1 });
  });
  it("applies the half-open click boundaries and distinguishes missing visitor hashes", () => {
    const result = report({ clicks: [click("before", a, "2026-09-28T17:59:59.999Z"), click("start", a, request.since, null), click("last", a, "2026-09-30T17:59:59.999Z", null), click("end", a, request.until)], orders: [] });
    expect(result.totals).toMatchObject({ clicks: 2, estimated_visitor_days: 0 });
  });
  it("deduplicates total visitor-days across links and recomputes ratios", () => {
    const result = report({ clicks: [click(), click("cb", b), click("cb2", b, "2026-09-30T10:00:00Z", "day2")], orders: [order(), order("o2", { campaign_link_id: b.id, campaign_click_id: "cb" })] });
    expect(result.rows[0].estimated_visitor_days).toBe(1);
    expect(result.rows[1].estimated_visitor_days).toBe(2);
    expect(result.totals.estimated_visitor_days).toBe(2);
    expect(result.totals.click_to_order).toBeCloseTo(2 / 3);
  });
  it("does not re-expire attribution when a day-29 protection hold is approved on day 31", () => {
    const result = report({ clicks: [click("c1", a, "2026-09-01T00:00:00Z")], orders: [order("held", { campaign_attributed_at: "2026-09-30T00:00:00Z", created_at: "2026-10-02T00:00:00Z" })], request: { ...request, range: { from: "2026-09-01", to: "2026-09-01" }, since: "2026-08-31T18:00:00Z", until: "2026-09-01T18:00:00Z" } });
    expect(result.totals.orders).toBe(1);
  });
  it("keeps the order-created unattributed website comparison outside all campaign totals", () => {
    const unattributedOrders = [order("u", { campaign_link_id: null, campaign_click_id: null, created_at: "2026-09-29T10:00:00Z" }), order("social", { source: "facebook", campaign_link_id: null, campaign_click_id: null, created_at: "2026-09-29T10:00:00Z" }), order("outside", { campaign_link_id: null, campaign_click_id: null })];
    const result = report({ unattributedOrders });
    expect(result.unattributed).toMatchObject({ orders: 1, clicks: 0, click_to_order: null, date_basis: "order_created", label: "Unattributed website orders placed in this period" });
    expect(result.totals.orders).toBe(1);
    expect(result.totals.order_value).toBe(1000);
  });
  it("does not count an expired recovery as attributed just because its draft had attribution", () => {
    const result = report({ orders: [], checkouts: [{ id: "d1", org_id: org, campaign_link_id: a.id, campaign_click_id: "c1", status: "recovered" }],
      checkoutOrderLinks: [{ org_id: org, abandoned_checkout_id: "d1", campaign_link_id: null, campaign_click_id: null }] });
    expect(result.totals).toMatchObject({ orders: 0, captured_checkouts: 0 });
  });
  it("never lets foreign draft linkage suppress this workspace's captured checkout", () => {
    const result = report({ orders: [], checkouts: [{ id: "d1", org_id: org, campaign_link_id: a.id, campaign_click_id: "c1" }], checkoutOrderLinks: [{ org_id: "other", abandoned_checkout_id: "d1" }] });
    expect(result.totals.captured_checkouts).toBe(1);
  });
  it("does not deduplicate independent captured drafts by phone or product", () => {
    const result = report({ orders: [], checkouts: ["d1", "d2"].map((id) => ({ id, org_id: org, campaign_link_id: a.id, campaign_click_id: "c1", phone: "01700000000", product: "Mango" })) });
    expect(result.totals.captured_checkouts).toBe(2);
  });
  it("keeps outputs free of visitor hashes, customer fields and raw joins", () => {
    const result = report({ links: [{ ...a, private_join: { secret: "raw" } }], orders: [order("o1", { phone: "01700000000", customer_name: "private", address: "private" })] });
    expect(JSON.stringify(result)).not.toMatch(/visitor_hash|01700000000|private|raw/);
  });
});

describe("campaign monetary completeness", () => {
  it("includes returned order fees while excluding shipping income from contribution", () => {
    const result = report({ orders: [order(), order("returned", { status: "returned", courier_fee: 80 })] });
    expect(result.totals).toMatchObject({ order_value: 2000, delivered: 1, returned: 1, delivered_revenue: 1000, delivered_cogs: 400, courier_fees: 180, estimated_delivered_profit: 420, order_to_delivered: 0.5, loss_rate: 0.5 });
    expect(result.totals.courier_fee_coverage).toEqual({ recorded_orders: 2, total_orders: 2 });
  });
  it("matches Business Report merchandise value for the same order IDs, not different date-scoped headlines", () => {
    const orders = [order(), order("o2", { status: "confirmed", price: 500 })];
    const campaign = report({ orders });
    const business = buildBusinessReport(orders, { ...request, since: "2026-10-01T18:00:00Z", until: "2026-10-03T18:00:00Z" });
    expect(campaign.totals.order_value).toBe(1500);
    expect(campaign.totals.order_value).toBe(business.summary.order_value);
    expect(campaign.totals.delivered_revenue).toBe(1000);
  });
  it("propagates missing prices without pretending a known zero, including team revenue explanations", () => {
    const result = report({ orders: [order("o1", { price: null })] });
    expect(result.totals).toMatchObject({ order_value: null, delivered_revenue: null, estimated_delivered_profit: null, revenue_incomplete_reasons: ["order_price_missing"] });
    expect(redactCampaignFinancials(result).totals.revenue_incomplete_reasons).toEqual(["order_price_missing"]);
  });
  it("never recognizes revenue from confirmed or approval-pending delivery markers", () => {
    const result = report({ orders: [order("confirmed", { status: "confirmed" }), order("unresolved", { courier_status: "delivered_approval_pending" })] });
    expect(result.totals).toMatchObject({ confirmed: 2, delivered: 0, delivered_revenue: 0, delivered_cogs: 0, estimated_delivered_profit: -200 });
  });
  it("propagates unknown partial delivery amounts to link, daily and total revenue/profit", () => {
    const result = report({ orders: [order(), order("partial", { status: "partial_delivered", delivered_amount: 500 })] });
    for (const metrics of [result.rows[0], result.totals, result.daily[0]]) {
      expect(metrics).toMatchObject({ delivered: 2, delivered_revenue: null, delivered_cogs: null, estimated_delivered_profit: null, revenue_complete: false });
      expect(metrics.revenue_incomplete_reasons).toContain("partial_delivery_amount_unknown");
    }
    expect(result.rows[0].recent_orders.find((o) => o.id === "partial")).toMatchObject({ delivery_kind: "partial", delivered_revenue: null });
    expect(result.rows[1].delivered_revenue).toBe(0);
  });
  it.each([null, 0, -1, "invalid", Infinity, "400oops"])("missing or unusable catalog COGS %s is never zero-cost profit", (cog) => {
    const result = report({ products: [{ ...products[0], cog }] });
    expect(result.totals).toMatchObject({ delivered_revenue: 1000, delivered_cogs: null, estimated_delivered_profit: null, cogs_coverage: { set: 0, total: 1, complete_orders: 0, total_orders: 1 } });
    expect(result.meta.cogs_incomplete_reasons).toContain("missing_product_cost");
  });
  it("does not mistake a partially priced helper total for complete COGS", () => {
    const result = report({ orders: [order("o1", { product: "1x Mango, 1x Unknown" })] });
    expect(result.totals.delivered_cogs).toBeNull();
    expect(result.totals.cogs_coverage).toMatchObject({ set: 1, total: 2 });
  });
  it("preserves the existing helper's priced duplicate-name preference for legacy summaries", () => {
    const result = report({ products: [products[0], { id: "p2", name: "Mango", cog: 100 }] });
    expect(result.totals.delivered_cogs).toBe(400);
    expect(result.totals.estimated_delivered_profit).toBe(500);
  });
  it("cannot silently turn unsafe cost arithmetic into zero COGS", () => {
    const result = report({ products: [{ ...products[0], cog: 90071992547409 }], orders: [order("o1", { product: "2x Mango" })] });
    expect(result.totals.delivered_cogs).toBeNull();
    expect(result.totals.estimated_delivered_profit).toBeNull();
    expect(result.totals.cogs_incomplete_reasons).toContain("invalid_cost_amount");
  });
  it("treats empty legacy summaries as missing COGS, not a zero-priced order", () => {
    expect(report({ orders: [order("o1", { product: null })] }).totals.estimated_delivered_profit).toBeNull();
  });
  it("retains a recorded-fees-only estimate for null fees, with explicit coverage", () => {
    const result = report({ orders: [order("o1", { courier_fee: null }), order("o2", { status: "cancelled", courier_fee: 0 })] });
    expect(result.totals).toMatchObject({ courier_fees: 0, estimated_delivered_profit: 600, courier_fee_coverage: { recorded_orders: 1, total_orders: 2 } });
    expect(result.meta.profit_basis).toContain("recorded courier fees");
  });
  it("uses authoritative item quantities and IDs rather than a recovered summary", () => {
    const result = report({ orders: [order("o1", { product: "Mango" })], orderItems: [{ order_id: "o1", org_id: org, product_id: "p1", product_name: "Old name", quantity: 3 }] });
    expect(result.totals.delivered_cogs).toBe(1200);
    expect(result.totals.estimated_delivered_profit).toBe(-300);
  });
  it("does not fuzzy-match authoritative items with missing product IDs", () => {
    const result = report({ orderItems: [{ order_id: "o1", org_id: org, product_id: "missing", product_name: "Mango", quantity: 3 }] });
    expect(result.totals.delivered_cogs).toBeNull();
  });
  it("uses inline order_items with strict ID/name matching when available", () => {
    const result = report({ orders: [order("o1", { order_items: [{ product_id: "p1", quantity: 2 }] })] });
    expect(result.totals.delivered_cogs).toBe(800);
  });
  it.each([0, -1, null, 1.5, "bad"])("invalid authoritative quantity %s cannot fall back to summary", (quantity) => {
    expect(report({ orderItems: [{ order_id: "o1", product_id: "p1", quantity }] }).totals.delivered_cogs).toBeNull();
  });
  it("sums each order's integer poisha instead of floating point money", () => {
    const result = report({ products: [{ ...products[0], cog: 0.1 }], orders: [order("o1", { price: 0.1, courier_fee: 0 }), order("o2", { price: 0.2, courier_fee: 0 })] });
    expect(result.totals.order_value).toBe(0.3);
    expect(result.totals.delivered_revenue).toBe(0.3);
    expect(result.totals.delivered_cogs).toBe(0.2);
    expect(result.totals.estimated_delivered_profit).toBe(0.1);
  });
  it("counts mutually exclusive outcomes and never invents a decreasing funnel", () => {
    const result = report({ orders: [order(), order("confirmed", { status: "confirmed" }), order("pending", { status: "pending" }), order("cancelled", { status: "cancelled" }), order("returned", { status: "returned" })] });
    expect(result.totals).toMatchObject({ clicks: 1, captured_checkouts: 5, orders: 5, delivered: 1, confirmed: 1, pending: 1, cancelled: 1, returned: 1 });
  });
  it("bounds recent orders to the newest 50 while reporting all order metrics", () => {
    const result = report({ orders: Array.from({ length: 51 }, (_, i) => order(`o${i}`, { created_at: new Date(Date.parse("2026-10-01T00:00:00Z") + i * 1000).toISOString() })) });
    expect(result.rows[0].orders).toBe(51);
    expect(result.rows[0].recent_orders).toHaveLength(50);
    expect(result.rows[0].recent_orders[0].id).toBe("o50");
    expect(result.rows[0].has_more).toBe(true);
    expect(redactCampaignFinancials(result).rows[0].has_more).toBe(true);
  });
});

describe("team response projection", () => {
  it("allowlists all response depths, preserving revenue but never mutating the admin report", () => {
    const full = report({ orders: [order("partial", { status: "partial_delivered" })] });
    const forbidden = { delivered_cogs: 1, courier_fees: 2, delivered_profit: 3, estimated_delivered_profit: 4, spend: 5, roas_delivered: 6, profit_after_ads: 7, margin: 8, cost_coverage: { set: 9 }, fee_coverage: {}, cogs_incomplete_reasons: ["private"], secret_new_financial_alias: 10 };
    Object.assign(full.rows[0], forbidden);
    Object.assign(full.totals, forbidden);
    Object.assign(full.unattributed, forbidden);
    Object.assign(full.daily[0], forbidden);
    Object.assign(full.rows[0].recent_orders[0], forbidden);
    Object.assign(full.meta, forbidden);
    const before = JSON.stringify(full);
    const team = redactCampaignFinancials(full);
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        expect(Object.keys(forbidden)).not.toContain(key);
        expect(["cogs_coverage", "courier_fee_coverage", "profit_incomplete_reasons", "profit_basis"]).not.toContain(key);
        visit(nested);
      }
    };
    visit(team);
    expect(team.rows[0]).toMatchObject({ orders: 1, delivered: 1, delivered_revenue: null, revenue_incomplete_reasons: ["partial_delivery_amount_unknown"] });
    expect(team.meta).toMatchObject({ date_basis: "click", as_of: request.as_of, attribution_window_days: 30, revenue_incomplete_reasons: ["partial_delivery_amount_unknown"] });
    expect(JSON.stringify(full)).toBe(before);
    team.rows[0].revenue_incomplete_reasons.push("local");
    expect(JSON.stringify(full)).toBe(before);
  });
  it("projects list rows, detail/envelope metadata and create/edit shapes, not only full reports", () => {
    const row = report().rows[0];
    for (const shape of [row, [row], { link: row, metrics: row, meta: { delivered_profit: 8, date_basis: "click" } }, { data: row }, { report: { rows: [row] } }]) {
      expect(JSON.stringify(redactCampaignFinancials(shape))).not.toMatch(/delivered_cogs|courier_fees|profit|coverage/);
      expect(JSON.stringify(redactCampaignFinancials(shape))).toContain("Reel A");
    }
  });
  it("fails closed for financial objects smuggled under allowed scalar names or reasons", () => {
    const team = redactCampaignFinancials({ name: { delivered_profit: 9 }, delivered_revenue: { margin: 99 }, revenue_incomplete_reasons: [{ courier_fees: 8 }, "partial_delivery_amount_unknown", "missing_product_cost"], meta: { range: { from: "2026-09-29", to: "2026-09-30", courier_fees: 8 } } });
    expect(team).toEqual({ revenue_incomplete_reasons: ["partial_delivery_amount_unknown"], meta: { range: { from: "2026-09-29", to: "2026-09-30" } } });
  });
});
