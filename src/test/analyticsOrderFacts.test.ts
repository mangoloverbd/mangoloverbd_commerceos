import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { startCampaignPostgres } from "./helpers/campaignPostgres";

// Real PostgreSQL: order ↔ visit linkage on top of every migration.
const org = "40000000-0000-4000-8000-000000000001";
const otherOrg = "40000000-0000-4000-8000-000000000002";
let db: ReturnType<typeof startCampaignPostgres>;
beforeAll(() => { db = startCampaignPostgres(); }, 60_000);
afterAll(() => db?.stop());

const as = (query: string) => db.sql(`set role service_role; ${query}`);
function visit({ visitor = randomUUID(), at, source = "direct", medium = "none", campaign = null as string | null, path = "/", workspace = org }: {
  visitor?: string; at: string; source?: string; medium?: string; campaign?: string | null; path?: string; workspace?: string;
}) {
  const session = randomUUID();
  const entry = JSON.stringify({ source, medium, ...(campaign ? { utm_campaign: campaign, utm_source: source } : {}) });
  expect(as(`select public.record_analytics_hit('${workspace}','${randomUUID()}','${session}','${visitor}','page_view','${path}',null,0,'${at}','${entry}'::jsonb)`)).toBe("recorded");
  return { session, visitor };
}
function order(workspace = org) {
  return as(`insert into public.orders(org_id,order_number,source) values ('${workspace}','W-${randomUUID().slice(0, 8)}','website') returning id`).split("\n").at(-1)!;
}
const record = (orderId: string, session: string, at: string, workspace = org) =>
  as(`select public.record_analytics_order_fact('${workspace}','${orderId}','${session}','${at}')`);
const fact = (orderId: string, columns: string) => as(`select concat_ws('|', ${columns}) from public.analytics_order_facts where order_id = '${orderId}'`);

describe("analytics order facts", () => {
  it("credits the last non-direct visit and keeps the first visit for comparison", () => {
    const first = visit({ at: "2026-09-20T10:00:00Z", source: "google", medium: "organic", path: "/" });
    const ad = visit({ visitor: first.visitor, at: "2026-09-29T10:00:00Z", source: "facebook", medium: "paid", campaign: "himsagar-reel", path: "/step/katimon-mango" });
    const direct = visit({ visitor: first.visitor, at: "2026-10-02T10:00:00Z", path: "/product/katimon-mango" });
    const id = order();
    expect(record(id, direct.session, "2026-10-02T10:05:00Z")).toBe("recorded");
    expect(fact(id, "session_id, last_session_id, last_source, last_medium, last_utm_campaign, last_entry_path, first_session_id, first_source, sessions_in_window"))
      .toBe([direct.session, ad.session, "facebook", "paid", "himsagar-reel", "/step/katimon-mango", first.session, "google", 3].join("|"));
  });

  it("keeps a truly direct journey direct and ignores visits older than 30 days", () => {
    const old = visit({ at: "2026-08-01T10:00:00Z", source: "facebook", medium: "paid" });
    const today = visit({ visitor: old.visitor, at: "2026-10-03T09:00:00Z" });
    const id = order();
    expect(record(id, today.session, "2026-10-03T09:10:00Z")).toBe("recorded");
    expect(fact(id, "last_session_id = first_session_id, last_source, sessions_in_window")).toBe("t|direct|1");
  });

  it("freezes attribution: a retry or later visit never rewrites it", () => {
    const ad = visit({ at: "2026-10-03T08:00:00Z", source: "instagram", medium: "social" });
    const id = order();
    expect(record(id, ad.session, "2026-10-03T08:05:00Z")).toBe("recorded");
    const later = visit({ visitor: ad.visitor, at: "2026-10-03T08:20:00Z", source: "google", medium: "organic" });
    expect(record(id, later.session, "2026-10-03T08:25:00Z")).toBe("duplicate");
    expect(fact(id, "last_source")).toBe("instagram");
  });

  it("leaves the order unattributed for unknown, stale or other-workspace visits", () => {
    const id = order();
    expect(record(id, randomUUID(), "2026-10-03T08:00:00Z")).toBe("no_session");
    const stale = visit({ at: "2026-10-03T06:00:00Z" });
    expect(record(id, stale.session, "2026-10-03T07:00:00Z")).toBe("no_session");
    const foreign = visit({ at: "2026-10-03T07:59:00Z", workspace: otherOrg });
    expect(record(id, foreign.session, "2026-10-03T08:00:00Z")).toBe("no_session");
    expect(as(`select count(*) from public.analytics_order_facts where order_id = '${id}'`)).toBe("0");
  });

  it("never writes a fact for another workspace's order", () => {
    const own = visit({ at: "2026-10-03T08:00:00Z" });
    expect(record(order(otherOrg), own.session, "2026-10-03T08:01:00Z")).toBe("rejected");
  });

  it("survives session retention and is removed with its order", () => {
    const own = visit({ at: "2026-10-03T08:00:00Z", source: "facebook", medium: "social" });
    const id = order();
    record(id, own.session, "2026-10-03T08:01:00Z");
    db.sql(`delete from public.analytics_sessions where id = '${own.session}'`);
    expect(fact(id, "last_source")).toBe("facebook");
    db.sql(`delete from public.orders where id = '${id}'`);
    expect(as(`select count(*) from public.analytics_order_facts where order_id = '${id}'`)).toBe("0");
  });

  it("keeps browsers out and lets the server only read and insert", () => {
    for (const role of ["anon", "authenticated"]) {
      expect(() => db.sql(`set role ${role}; select count(*) from public.analytics_order_facts;`)).toThrow(/permission denied/);
      expect(() => db.sql(`set role ${role}; select public.record_analytics_order_fact('${org}','${randomUUID()}','${randomUUID()}',now());`)).toThrow(/permission denied/);
    }
    expect(() => as(`update public.analytics_order_facts set last_source = 'x';`)).toThrow(/permission denied/);
    expect(as(`select relrowsecurity from pg_class where relname = 'analytics_order_facts'`)).toBe("t");
  });
});
