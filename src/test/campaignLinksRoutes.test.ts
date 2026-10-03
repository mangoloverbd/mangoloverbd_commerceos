import { describe, expect, it } from "vitest";
import { database, handlers, http, link, orgId, foreignOrg, signedHeaders, uuid } from "./campaignHandlerHarness";

const seed = (role = "admin") => ({ campaign_links: [link, { ...link, id: uuid(3), org_id: foreignOrg }], user_roles: [{ user_id: uuid(1), org_id: orgId, role, deleted_at: null }] });
const range = "?from=2026-10-01&to=2026-10-03";
describe("campaign staff HTTP handlers", () => {
  for (const role of ["admin", "team_member"]) it(`${role} manages another member's link with safe serialization`, async () => {
    const db = database(seed(role)); const { app } = handlers(db);
    const list = await http(app, "GET", "/api/campaign-links" + range);
    expect(list.status).toBe(200); expect(list.body.rows).toHaveLength(1);
    expect(list.headers.get("cache-control")).toBe("private, no-store");
    const detail = await http(app, "GET", `/api/campaign-links/${link.id}${range}`);
    expect(detail.body.link.name).toBe(link.name);
    for (const value of [list.body, detail.body]) {
      expect(JSON.stringify(value).includes("estimated_delivered_profit")).toBe(role === "admin");
      expect(JSON.stringify(value).includes("courier_fee_coverage")).toBe(role === "admin");
      expect(JSON.stringify(value)).not.toContain("visitor_hash");
    }
    const created = await http(app, "POST", "/api/campaign-links", { name: "New campaign", slug: "new-campaign", channel: "sms", destination_path: "/" });
    expect(created.status).toBe(201); expect(created.body.link.created_by).toBe(uuid(1));
    expect(created.body.link).not.toHaveProperty("org_id");
    for (const archived of [true, false]) {
      const edited = await http(app, "PATCH", `/api/campaign-links/${link.id}`, { name: "Edited", archived });
      expect(edited.status).toBe(200); expect(Boolean(edited.body.link.archived_at)).toBe(archived);
    }
    expect(db.calls.some(call => call.table === "user_roles" && call.method === "is" && call.args[0] === "deleted_at")).toBe(true);
  });
  it("rejects auth, unknown/deleted roles, foreign IDs, spoofed fields and invalid ranges", async () => {
    const db = database(seed()); const { app } = handlers(db);
    expect((await http(app, "GET", "/api/campaign-links", undefined, {})).status).toBe(401);
    db.tables.user_roles[0].role = "owner";
    expect((await http(app, "GET", "/api/campaign-links")).status).toBe(403);
    db.tables.user_roles[0].role = "team_member"; db.tables.user_roles[0].deleted_at = "2026-10-01";
    expect((await http(app, "GET", "/api/campaign-links")).status).toBe(403);
    db.tables.user_roles[0].deleted_at = null;
    expect((await http(app, "PATCH", `/api/campaign-links/${uuid(3)}`, { name: "Foreign" })).status).toBe(404);
    for (const field of ["org_id", "role", "created_by", "spend", "meta_ad_id"]) expect((await http(app, "POST", "/api/campaign-links", { name: "Spoof", slug: "spoof", channel: "sms", destination_path: "/", [field]: foreignOrg })).status).toBe(400);
    for (const query of ["?from=bad&to=2026-10-01", "?from=2025-01-01&to=2026-10-01", "?from=2026-10-02&to=2026-10-01"]) expect((await http(app, "GET", "/api/campaign-links" + query)).status).toBe(400);
  });
  it("reports duplicates and first-click rename conflicts through the locking RPC", async () => {
    const db = database(seed()); const { app } = handlers(db);
    expect((await http(app, "POST", "/api/campaign-links", { ...link, id: undefined, org_id: undefined, created_by: undefined, archived_at: undefined })).status).toBe(409);
    db.tables.campaign_link_clicks = [{ id: uuid(4), org_id: orgId, link_id: link.id }];
    expect((await http(app, "PATCH", `/api/campaign-links/${link.id}`, { slug: "renamed" })).status).toBe(409);
    expect(db.calls.some(call => call.table === "rename_campaign_link")).toBe(true);
  });
  it("loads more than 1000 clicks/orders and outside-range draft linkage in batches", async () => {
    const clicks = Array.from({ length: 1005 }, (_, n) => ({ id: uuid(n + 100), org_id: orgId, link_id: link.id, is_bot: false, clicked_at: "2026-10-01T03:00:00Z" }));
    const orders = clicks.map((click, n) => ({ id: uuid(n + 2000), org_id: orgId, campaign_link_id: link.id, campaign_click_id: click.id, source: "website", created_at: "2026-11-01T00:00:00Z", price: 100, status: "pending" }));
    const db = database({ ...seed(), campaign_link_clicks: clicks, orders: [...orders, { id: uuid(5000), org_id: orgId, abandoned_checkout_id: uuid(6000), campaign_click_id: null, campaign_link_id: null, created_at: "2026-09-01" }], abandoned_checkouts: [{ id: uuid(6000), org_id: orgId, campaign_link_id: link.id, campaign_click_id: clicks[0].id }] });
    const result = await http(handlers(db).app, "GET", `/api/campaign-links/${link.id}${range}`);
    expect(result.status).toBe(200); expect(result.body.totals.orders).toBe(1005); expect(result.body.totals.clicks).toBe(1005); expect(result.body.totals.captured_checkouts).toBe(1005);
    expect(result.body.link.recent_orders).toHaveLength(50); expect(result.body.link.has_more).toBe(true);
    expect(db.calls.filter(call => call.method === "in").every(call => (call.args[1] as unknown[]).length <= 200)).toBe(true);
    expect(db.calls.some(call => call.table === "campaign_link_clicks" && call.method === "range" && Number(call.args[0]) > 0)).toBe(true);
  });
  it("returns retryable 503, never incomplete totals, on failed data reads", async () => {
    const db = database(seed()); db.failures.campaign_link_clicks = { message: "offline" };
    const result = await http(handlers(db).app, "GET", "/api/campaign-links" + range);
    expect(result.status).toBe(503); expect(result.body.retryable).toBe(true); expect(result.body).not.toHaveProperty("totals");
  });
  it("aborts a hung report with one ten-second budget and returns no partial report", async () => {
    const db = database(seed()); db.hanging.add("campaign_links");
    const budgets: number[] = [];
    const { app } = handlers(db, { setTimeout: (callback: () => void, milliseconds: number) => { budgets.push(milliseconds); return setTimeout(callback, 20); } });
    const result = await http(app, "GET", "/api/campaign-links" + range);
    expect(result.status).toBe(503); expect(result.headers.get("retry-after")).toBe("5"); expect(result.body).not.toHaveProperty("rows");
    expect(budgets).toEqual([10_000]);
    const signal = db.calls.find(call => call.method === "abortSignal")?.args[0] as AbortSignal;
    expect(signal.aborted).toBe(true);
  });
  it("rereads a role downgrade and excludes archived links from the exact totals scope", async () => {
    const archived = { ...link, id: uuid(8), slug: "archived-link", archived_at: "2026-10-01" };
    const db = database({ ...seed(), campaign_links: [link, archived], campaign_link_clicks: [link, archived].map((row, n) => ({ id: uuid(100 + n), org_id: orgId, link_id: row.id, clicked_at: "2026-10-01T00:00:00Z", is_bot: false, visitor_hash: "same-estimated-visitor" })) });
    const { app } = handlers(db);
    const active = await http(app, "GET", "/api/campaign-links" + range);
    expect(active.body.totals.clicks).toBe(1); expect(active.body.totals).toHaveProperty("estimated_delivered_profit");
    db.tables.user_roles[0].role = "team_member";
    const all = await http(app, "GET", "/api/campaign-links" + range + "&include_archived=true");
    expect(all.body.totals.clicks).toBe(2); expect(all.body.totals.estimated_visitor_days).toBe(1);
    expect(JSON.stringify(all.body)).not.toMatch(/cogs|courier_fees|profit|spend|roas/);
  });
  it("projects nested partial-revenue explanations without leaking costs and deduplicates a draft by outside-period hash", async () => {
    const draftKey = uuid(6010);
    const db = database({ ...seed("team_member"), campaign_link_clicks: [{ id: uuid(40), org_id: orgId, link_id: link.id, clicked_at: "2026-10-01T00:00:00Z", is_bot: false }],
      abandoned_checkouts: [{ id: uuid(6011), org_id: orgId, draft_key: draftKey, campaign_link_id: link.id, campaign_click_id: uuid(40) }],
      orders: [{ id: uuid(6020), org_id: orgId, campaign_link_id: link.id, campaign_click_id: uuid(40), price: 100, courier_fee: 50, status: "partial_delivered", created_at: "2026-11-01T00:00:00Z" }, { id: uuid(6021), org_id: orgId, source: "website", created_at: "2026-09-01T00:00:00Z", abandoned_draft_key_hash: "hash-placeholder" }, { id: uuid(6022), org_id: orgId, source: " WEBSITE ", price: 50, status: "pending", created_at: "2026-10-01T00:00:00Z" }] });
    const { hashAbandonedCheckoutDraftKey } = await import("../../server/abandonedCheckouts.js");
    db.tables.orders[1].abandoned_draft_key_hash = hashAbandonedCheckoutDraftKey(draftKey);
    const result = await http(handlers(db).app, "GET", `/api/campaign-links/${link.id}${range}`);
    expect(result.status).toBe(200); expect(result.body.totals.captured_checkouts).toBe(1);
    expect(result.body.unattributed.orders).toBe(1); expect(result.body.totals.delivered_revenue).toBeNull();
    expect(result.body.link.recent_orders[0].revenue_incomplete_reasons).toEqual(["partial_delivery_amount_unknown"]);
    expect(result.body.daily[0].revenue_incomplete_reasons).toEqual(["partial_delivery_amount_unknown"]);
    expect(JSON.stringify(result.body)).not.toMatch(/cogs|courier_fees|profit|spend|roas/);
  });
});

describe("campaign public HTTP click handler", () => {
  it('read-only GET lookup returns destination/defaults without recording a click', async () => {
    const db = database({ campaign_links: [link] }); const { app } = handlers(db);
    const result = await http(app, 'GET', `/api/public/v1/mangolover/campaign-links/${link.slug}/clicks`);
    expect(result.status).toBe(200); expect(result.body.destinationPath).toBe(link.destination_path);
    expect(result.body.clickId).toBe(null); expect(db.calls.filter(call => call.method === 'rpc')).toHaveLength(0);
  });
  it("requires verified context and trusted request UUID, retries idempotently, keeps archived destinations", async () => {
    const db = database({ ...seed(), campaign_links: [{ ...link, archived_at: "2026-10-01" }] }); const { app } = handlers(db);
    const path = `/api/public/v1/mangolover/campaign-links/${link.slug}/clicks`;
    expect((await http(app, "POST", path, {}, {})).body).toEqual({ clickId: null, destinationPath: link.destination_path, utm: { utm_source: "facebook", utm_medium: "campaign_link", utm_campaign: link.slug } });
    const headers = { ...signedHeaders(), "x-mlbd-campaign-request-id": uuid(99) };
    const first = await http(app, "POST", path, {}, headers); const retry = await http(app, "POST", path, {}, headers);
    expect(first.status).toBe(200); expect(first.body.clickId).toBeTruthy(); expect(retry.body.clickId).toBe(first.body.clickId);
    expect(db.tables.campaign_link_clicks).toHaveLength(1);
    expect(db.tables.campaign_link_clicks[0].visitor_hash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("persists bots but returns no cookie ID; insert outages retain destination/defaults; unknown slug falls back", async () => {
    const db = database(seed()); const { app } = handlers(db); const path = `/api/public/v1/mangolover/campaign-links/${link.slug}/clicks`;
    const bot = await http(app, "POST", path, {}, { ...signedHeaders("facebookexternalhit/1.1"), "x-mlbd-campaign-request-id": uuid(99) });
    expect(bot.body.clickId).toBeNull(); expect(db.tables.campaign_link_clicks[0].is_bot).toBe(true);
    db.failures.record_campaign_link_click = { message: "write unavailable" };
    const outage = await http(app, "POST", path, {}, { ...signedHeaders(), "x-mlbd-campaign-request-id": uuid(98) });
    expect(outage.status).toBe(200); expect(outage.body.destinationPath).toBe(link.destination_path); expect(outage.body.utm.utm_source).toBe("facebook");
    const unknown = await http(app, "POST", "/api/public/v1/mangolover/campaign-links/unknown/clicks", {}, {});
    expect(unknown.status).toBe(404); expect(unknown.body.destinationPath).toBe("/");
    expect((await http(app, "POST", "/api/public/v1/foreign/campaign-links/mango-reel/clicks", {}, {})).status).toBe(404);
  });
  it("lookup timeouts fall back independently; malformed request IDs/forged context and malformed slugs never write", async () => {
    const db = database(seed()); const { app } = handlers(db);
    const path = `/api/public/v1/mangolover/campaign-links/${link.slug}/clicks`;
    for (const headers of [{ ...signedHeaders(), "x-mlbd-campaign-request-id": "bad" }, { ...signedHeaders(), "x-mlbd-campaign-request-id": uuid(9), "x-mlbd-client-context": "forged" }]) {
      expect((await http(app, "POST", path, { requestId: uuid(9) }, headers)).body.clickId).toBeNull();
    }
    expect(db.tables.campaign_link_clicks).toBeUndefined();
    expect((await http(app, "POST", "/api/public/v1/mangolover/campaign-links/invalid_slug/clicks", {}, signedHeaders())).status).toBe(404);
    db.hanging.add("campaign_links");
    const timeout = await http(app, "POST", path, {}, signedHeaders());
    expect(timeout.status).toBe(503); expect(timeout.body).toMatchObject({ destinationPath: "/", clickId: null, utm: {} });
  });
});
