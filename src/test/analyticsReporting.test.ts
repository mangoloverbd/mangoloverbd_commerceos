import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { startCampaignPostgres } from "./helpers/campaignPostgres";
import { customerOrderOutcome } from "../../server/customerOutcomes.js";

// Real PostgreSQL: Phase 2c maintenance and the Phase 3 report on every migration.
let db: ReturnType<typeof startCampaignPostgres>;
beforeAll(() => { db = startCampaignPostgres(); }, 60_000);
afterAll(() => db?.stop());

const as = (query: string) => db.sql(`set role service_role; ${query}`);
const json = <T,>(query: string) => JSON.parse(as(query)) as T;
let orgCounter = 0;
const newOrg = () => `50000000-0000-4000-8000-${String(++orgCounter).padStart(12, "0")}`;

function visit(org: string, { visitor = randomUUID(), at, source = "direct", medium = "none", path = "/", device = "mobile", campaign = null as string | null }: {
  visitor?: string; at: string; source?: string; medium?: string; path?: string; device?: string; campaign?: string | null;
}) {
  const session = randomUUID();
  const entry = JSON.stringify({ source, medium, device, ...(campaign ? { utm_campaign: campaign } : {}) });
  const slug = path.startsWith("/product/") ? `'${path.slice(9)}'` : "null";
  expect(as(`select public.record_analytics_hit('${org}','${randomUUID()}','${session}','${visitor}','page_view','${path}',${slug},0,'${at}','${entry}'::jsonb)`)).toBe("recorded");
  return { session, visitor };
}
function step(org: string, v: { session: string; visitor: string }, kind: string, at: string, path = "/", active = 0) {
  const slug = path.startsWith("/product/") ? `'${path.slice(9)}'` : "null";
  return as(`select public.record_analytics_hit('${org}','${randomUUID()}','${v.session}','${v.visitor}','${kind}','${path}',${slug},${active},'${at}','{}'::jsonb)`);
}
function order(org: string, { price = 1000, status = "pending", courier = null as string | null, at = "2026-10-03T08:00:00Z", productId = null as string | null } = {}) {
  const id = as(`insert into public.orders(org_id,order_number,source,price,status,courier_status,created_at) values ('${org}','W-${randomUUID().slice(0, 8)}','website',${price},'${status}',${courier ? `'${courier}'` : "null"},'${at}') returning id`).split("\n").at(-1)!;
  if (productId) as(`insert into public.order_items(org_id,order_id,product_id,product_name,unit_price,quantity) values ('${org}','${id}','${productId}','Mango',${price},1)`);
  return id;
}
const link = (org: string, orderId: string, session: string, at: string) => expect(as(`select public.record_analytics_order_fact('${org}','${orderId}','${session}','${at}')`)).toBe("recorded");

describe("order outcome parity", () => {
  it("classifies exactly like customerOrderOutcome", () => {
    const rows = [
      {}, { status: "Delivered" }, { courier_status: "delivered" }, { courier_status: "partial delivered" }, { status: "partial_delivered_approval_pending" },
      { status: "returned" }, { courier_status: "Return Pending" }, { courier_status: "return-pending", status: "returned" }, { return_status: "completed", status: "delivered" },
      { return_status: "Returned" }, { status: "Cancelled" }, { courier_status: "canceled" }, { fulfillment_status: "rejected" }, { status: "  delivered  " },
      { status: "approved", courier_status: "in_review" }, { status: "delivered", courier_status: "cancelled" },
    ] as Array<Record<string, string>>;
    for (const row of rows) {
      const lit = (value?: string) => (value === undefined ? "null" : `'${value}'`);
      expect(as(`select public.analytics_order_outcome(${lit(row.status)},${lit(row.courier_status)},${lit(row.fulfillment_status)},${lit(row.return_status)})`), JSON.stringify(row))
        .toBe(customerOrderOutcome(row));
    }
  });
});

describe("nightly maintenance", () => {
  it("builds Dhaka-day summaries and is safe to re-run", () => {
    const org = newOrg();
    // 23:30 UTC on Oct 1 is Oct 2 in Dhaka.
    const late = visit(org, { at: "2026-10-01T23:30:00Z", source: "facebook", medium: "social", path: "/product/katimon-mango" });
    step(org, late, "page_view", "2026-10-01T23:31:00Z", "/checkout");
    step(org, late, "cart", "2026-10-01T23:32:00Z");
    visit(org, { visitor: late.visitor, at: "2026-10-02T10:00:00Z" });
    link(org, order(org), late.session, "2026-10-01T23:35:00Z");
    for (let run = 0; run < 2; run++) {
      const result = json<{ from: string; to: string }>(`select public.run_analytics_maintenance('${org}','2026-10-03T06:00:00Z')`);
      expect(result.to).toBe("2026-10-03");
    }
    expect(as(`select string_agg(concat_ws(':', day, sessions, visitors, pageviews, product_views, bounced_sessions, cart_sessions, ordered_sessions, orders), ',' order by day) from public.analytics_daily_totals where org_id = '${org}'`))
      .toBe("2026-10-02:2:1:3:1:1:1:1:1");
    expect(as(`select string_agg(source || ':' || sessions || ':' || orders, ',' order by source) from public.analytics_daily_sources where org_id = '${org}'`)).toBe("direct:1:0,facebook:1:1");
    expect(as(`select string_agg(path || ':' || views || ':' || entries, ',' order by path) from public.analytics_daily_pages where org_id = '${org}'`))
      .toBe("/:1:1,/checkout:1:0,/product/katimon-mango:1:1");
    expect(as(`select product_slug || ':' || views from public.analytics_daily_products where org_id = '${org}'`)).toBe("katimon-mango:1");
  });

  it("refreshes at least the last 7 days and catches up after missed runs", () => {
    const org = newOrg();
    expect(json<{ from: string }>(`select public.run_analytics_maintenance('${org}','2026-10-03T06:00:00Z')`).from).toBe("2026-09-03");
    expect(json<{ from: string }>(`select public.run_analytics_maintenance('${org}','2026-10-04T06:00:00Z')`).from).toBe("2026-09-28");
    expect(json<{ from: string }>(`select public.run_analytics_maintenance('${org}','2026-10-20T06:00:00Z')`).from).toBe("2026-10-03");
    expect(as(`select last_succeeded_at = '2026-10-20T06:00:00Z' from public.analytics_job_state where org_id = '${org}' and job = 'rollup'`)).toBe("t");
  });

  it("deletes raw events after 90 days and visits after 25 months, never order facts", () => {
    const org = newOrg();
    const old = visit(org, { at: "2024-08-01T08:00:00Z", source: "google", medium: "organic" });
    link(org, order(org, { at: "2024-08-01T08:05:00Z" }), old.session, "2024-08-01T08:05:00Z");
    const recent = visit(org, { at: "2026-06-01T08:00:00Z" });
    const fresh = visit(org, { at: "2026-10-01T08:00:00Z" });
    const result = json<{ deleted_events: number; deleted_sessions: number; more: boolean }>(`select public.run_analytics_maintenance('${org}','2026-10-03T06:00:00Z', 1)`);
    expect(result).toMatchObject({ deleted_events: 1, deleted_sessions: 1, more: true });
    json(`select public.run_analytics_maintenance('${org}','2026-10-03T06:00:00Z', 1000)`);
    expect(as(`select count(*) from public.analytics_sessions where org_id = '${org}'`)).toBe("2");
    expect(as(`select count(*) from public.analytics_events where session_id = '${recent.session}'`)).toBe("0");
    expect(as(`select count(*) from public.analytics_session_pages where session_id = '${recent.session}'`)).toBe("1");
    expect(as(`select count(*) from public.analytics_events where session_id = '${fresh.session}'`)).toBe("1");
    expect(as(`select last_source from public.analytics_order_facts where session_id = '${old.session}'`)).toBe("google");
  });

  it("keeps browsers out of summaries and the job", () => {
    for (const role of ["anon", "authenticated"]) {
      expect(() => db.sql(`set role ${role}; select count(*) from public.analytics_daily_totals;`)).toThrow(/permission denied/);
      expect(() => db.sql(`set role ${role}; select public.run_analytics_maintenance('${newOrg()}', now());`)).toThrow(/permission denied/);
      expect(() => db.sql(`set role ${role}; select public.analytics_website_report('${newOrg()}', now() - interval '1 day', now());`)).toThrow(/permission denied/);
    }
    expect(() => as(`delete from public.analytics_order_facts;`)).toThrow(/permission denied/);
  });
});

describe("website report", () => {
  it("reports traffic, funnel, products and order outcomes for the selected visits", () => {
    const org = newOrg();
    const productId = as(`insert into public.products(org_id,name,slug) values ('${org}','Katimon Mango','katimon-mango') returning id`).split("\n").at(-1)!;
    const ad = visit(org, { at: "2026-10-02T04:00:00Z", source: "facebook", medium: "paid", path: "/step/katimon-mango", campaign: "himsagar-reel", device: "mobile" });
    step(org, ad, "page_view", "2026-10-02T04:01:00Z", "/product/katimon-mango");
    step(org, ad, "cart", "2026-10-02T04:02:00Z");
    step(org, ad, "checkout", "2026-10-02T04:03:00Z");
    link(org, order(org, { price: 1200, status: "delivered", productId, at: "2026-10-02T04:04:00Z" }), ad.session, "2026-10-02T04:04:00Z");
    const browse = visit(org, { at: "2026-10-02T09:00:00Z", source: "google", medium: "organic", path: "/product/katimon-mango", device: "desktop" });
    const back = visit(org, { visitor: ad.visitor, at: "2026-10-02T12:00:00Z" });
    link(org, order(org, { price: 800, status: "cancelled", at: "2026-10-02T12:01:00Z" }), back.session, "2026-10-02T12:01:00Z");
    order(org, { at: "2026-10-02T13:00:00Z" }); // website order with no visit evidence
    visit(org, { at: "2026-09-01T09:00:00Z" }); // outside the range

    type Report = {
      totals: Record<string, number>; daily: Array<{ day: string; sessions: number }>; hourly: Array<{ hour: number; sessions: number }>;
      sources: Array<Record<string, unknown>>; products: Array<Record<string, unknown>>; entry_pages: Array<Record<string, unknown>>;
      devices: Array<Record<string, unknown>>; campaigns: Array<Record<string, unknown>>;
      acquisition: { last: Array<Record<string, unknown>>; first: Array<Record<string, unknown>>; website_orders: number; matched_orders: number };
    };
    const report = json<Report>(`select public.analytics_website_report('${org}','2026-10-01T18:00:00Z','2026-10-02T18:00:00Z')`);
    expect(report.totals).toMatchObject({ sessions: 3, visitors: 2, pageviews: 4, product_sessions: 2, cart_sessions: 1, checkout_sessions: 1,
      ordered_sessions: 2, orders: 2, delivered_sessions: 1, bounced_sessions: 2 });
    expect(report.daily).toEqual([{ day: "2026-10-02", sessions: 3, visitors: 2, pageviews: 4, ordered_sessions: 2 }]);
    expect(report.hourly.find((row) => row.hour === 10)).toEqual({ hour: 10, sessions: 1 });
    expect(report.sources[0]).toMatchObject({ source: "direct", sessions: 1, ordered_sessions: 1 });
    expect(report.products).toEqual([{ product_slug: "katimon-mango", name: "Katimon Mango", views: 2, sessions: 2, ordered_sessions: 1, orders: 1, delivered: 1 }]);
    expect(report.campaigns).toEqual([{ campaign: "himsagar-reel", sessions: 1, ordered_sessions: 1 }]);
    expect(report.devices.map((row) => row.device)).toEqual(["mobile", "desktop"]);
    expect(report.entry_pages.find((row) => row.path === "/step/katimon-mango")).toMatchObject({ sessions: 1, orders: 1 });
    // The direct revisit's order is credited to the earlier Facebook ad (last non-direct).
    expect(report.acquisition.last).toEqual([{ source: "facebook", medium: "paid", orders: 2, placed_value: 1200, delivered: 1, delivered_value: 1200,
      partial_delivered: 0, returned: 0, cancelled: 1, active: 0 }]);
    expect(report.acquisition.first[0]).toMatchObject({ source: "facebook", orders: 2 });
    expect(report.acquisition).toMatchObject({ website_orders: 3, matched_orders: 2 });
    expect(browse.session).toBeTruthy();
  });

  it("rejects unbounded ranges", () => {
    expect(() => as(`select public.analytics_website_report('${newOrg()}','2024-01-01T00:00:00Z','2026-01-01T00:00:00Z')`)).toThrow(/invalid range/);
  });
});
