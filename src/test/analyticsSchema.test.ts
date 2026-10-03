import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { startCampaignPostgres } from "./helpers/campaignPostgres";

// Real PostgreSQL: applies every migration, including first-party analytics.
const org = "30000000-0000-4000-8000-000000000001";
const otherOrg = "30000000-0000-4000-8000-000000000002";
let db: ReturnType<typeof startCampaignPostgres>;
beforeAll(() => { db = startCampaignPostgres(); }, 60_000);
afterAll(() => db?.stop());

const entry = JSON.stringify({ source: "facebook", medium: "social", referrer_host: "m.facebook.com", utm_campaign: "himsagar-reel", device: "mobile", country: "BD", city: "Dhaka" });
function hit({ session = randomUUID(), visitor = randomUUID(), event = randomUUID(), kind = "page_view", path = "/", product = null as string | null,
  active = 0, at = "2026-10-03T08:00:00Z", workspace = org } = {}) {
  const status = db.sql(`set role service_role; select public.record_analytics_hit('${workspace}','${event}','${session}','${visitor}','${kind}','${path}',${product ? `'${product}'` : "null"},${active},'${at}','${entry}'::jsonb);`);
  return { status, session, visitor, event };
}
const one = (query: string) => db.sql(`set role service_role; ${query}`);
function sqlError(query: string) {
  try { db.sql(query); } catch (error) { return String((error as { stderr?: string }).stderr ?? error); }
  throw new Error("Expected the query to fail");
}

describe("first-party analytics schema", () => {
  it("opens a visit on the first page view with its entry source, device and city", () => {
    const first = hit({ path: "/step/katimon-mango" });
    expect(first.status).toBe("recorded");
    expect(one(`select concat_ws('|', entry_path, source, medium, utm_campaign, device, city, pageviews, is_new_visitor) from public.analytics_sessions where id = '${first.session}'`))
      .toBe("/step/katimon-mango|facebook|social|himsagar-reel|mobile|Dhaka|1|t");
    expect(one(`select concat_ws('|', path, views, is_entry) from public.analytics_session_pages where session_id = '${first.session}'`)).toBe("/step/katimon-mango|1|t");
  });

  it("counts page and product views within one visit and keeps the entry page", () => {
    const visit = hit({ path: "/" });
    hit({ session: visit.session, visitor: visit.visitor, path: "/product/katimon-mango", product: "katimon-mango", at: "2026-10-03T08:02:00Z" });
    hit({ session: visit.session, visitor: visit.visitor, path: "/product/katimon-mango", product: "katimon-mango", at: "2026-10-03T08:03:00Z" });
    expect(one(`select concat_ws('|', pageviews, product_views, last_seen_at = '2026-10-03T08:03:00Z') from public.analytics_sessions where id = '${visit.session}'`)).toBe("3|2|t");
    expect(one(`select string_agg(path || ':' || views || ':' || is_entry, ',' order by path) from public.analytics_session_pages where session_id = '${visit.session}'`))
      .toBe("/:1:true,/product/katimon-mango:2:false");
    expect(one(`select views from public.analytics_session_products where session_id = '${visit.session}' and product_slug = 'katimon-mango'`)).toBe("2");
  });

  it("ignores a retried event instead of counting it twice", () => {
    const visit = hit();
    expect(hit({ session: visit.session, visitor: visit.visitor, event: visit.event }).status).toBe("duplicate");
    expect(one(`select pageviews from public.analytics_sessions where id = '${visit.session}'`)).toBe("1");
  });

  it("records cart, checkout and engagement without opening a visit on their own", () => {
    const visit = hit();
    hit({ session: visit.session, visitor: visit.visitor, kind: "cart", at: "2026-10-03T08:05:00Z" });
    hit({ session: visit.session, visitor: visit.visitor, kind: "engage", active: 45, at: "2026-10-03T08:06:00Z" });
    expect(one(`select concat_ws('|', cart_at = '2026-10-03T08:05:00Z', checkout_at is null, engaged_seconds) from public.analytics_sessions where id = '${visit.session}'`)).toBe("t|t|45");
    expect(hit({ kind: "cart" }).status).toBe("expired");
    expect(hit({ kind: "engage", active: 10 }).status).toBe("expired");
  });

  it("expires a visit idle for more than 30 minutes and recognises a returning browser", () => {
    const visit = hit({ at: "2026-10-03T08:00:00Z" });
    expect(hit({ session: visit.session, visitor: visit.visitor, at: "2026-10-03T08:31:00Z" }).status).toBe("expired");
    const next = hit({ visitor: visit.visitor, at: "2026-10-03T08:31:00Z" });
    expect(next.status).toBe("recorded");
    expect(one(`select is_new_visitor from public.analytics_sessions where id = '${next.session}'`)).toBe("f");
  });

  it("never lets one workspace write into another workspace's visit", () => {
    const visit = hit();
    expect(hit({ session: visit.session, visitor: visit.visitor, workspace: otherOrg }).status).toBe("rejected");
    expect(one(`select count(*) from public.analytics_events where session_id = '${visit.session}'`)).toBe("1");
  });

  it("rejects malformed data at the database too", () => {
    expect(sqlError(`set role service_role; select public.record_analytics_hit('${org}','${randomUUID()}','${randomUUID()}','${randomUUID()}','page_view','no-slash',null,0,now(),'{}'::jsonb);`))
      .toContain("analytics_sessions_entry_path_check");
    const visit = hit();
    expect(sqlError(`set role service_role; select public.record_analytics_hit('${org}','${randomUUID()}','${visit.session}','${visit.visitor}','heartbeat','/',null,0,'2026-10-03T08:01:00Z','{}'::jsonb);`))
      .toContain("analytics_events_kind_check");
  });

  it("keeps browsers out and never lets the server rewrite recorded events", () => {
    for (const role of ["anon", "authenticated"]) {
      expect(sqlError(`set role ${role}; select count(*) from public.analytics_sessions;`)).toContain("permission denied");
      expect(sqlError(`set role ${role}; select public.record_analytics_hit('${org}','${randomUUID()}','${randomUUID()}','${randomUUID()}','page_view','/',null,0,now(),'{}'::jsonb);`)).toContain("permission denied");
    }
    // Deletes are granted only for retention (Phase 2c); events are never edited.
    expect(sqlError(`set role service_role; update public.analytics_events set path = '/';`)).toContain("permission denied");
    expect(one(`select relrowsecurity from pg_class where relname = 'analytics_session_products'`)).toBe("t");
  });
});
