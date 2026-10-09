import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startCampaignPostgres } from "./helpers/campaignPostgres";

// Real PostgreSQL: the Stuck tab needs to know when an order entered Processing
// and when its courier status last changed.
let db: ReturnType<typeof startCampaignPostgres>;
beforeAll(() => { db = startCampaignPostgres(); }, 60_000);
afterAll(() => db?.stop());

const org = "60000000-0000-4000-8000-000000000001";
const as = (query: string) => db.sql(`set role service_role; ${query}`);
const order = (status = "confirmed", courier: string | null = null) =>
  as(`insert into public.orders(org_id,order_number,source,status,courier_status) values ('${org}','W-${randomUUID().slice(0, 8)}','website','${status}',${courier ? `'${courier}'` : "null"}) returning id`).split("\n").at(-1)!;
const utc = (column: string) => `coalesce(to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), '-')`;
const stamps = (id: string) => as(`select ${utc("processing_at")} || '|' || ${utc("courier_status_at")} from public.orders where id = '${id}'`);

describe("order progress stamps", () => {
  it("stamps when an order enters Processing, and only then", () => {
    const id = order();
    expect(stamps(id)).toBe("-|-");
    as(`update public.orders set status = 'processing' where id = '${id}'`);
    const entered = stamps(id).split("|")[0];
    expect(entered).not.toBe("-");
    // Saving other fields, or saving Processing again, keeps the original time.
    as(`update public.orders set customer_name = 'Rahim', status = 'processing' where id = '${id}'`);
    expect(stamps(id).split("|")[0]).toBe(entered);
    expect(stamps(order("processing")).split("|")[0]).not.toBe("-");
  });

  it("stamps each courier status change", () => {
    const id = order("processing", "in_review");
    const first = stamps(id).split("|")[1];
    expect(first).not.toBe("-");
    as(`update public.orders set courier_status = 'in_review', customer_name = 'Karim' where id = '${id}'`);
    expect(stamps(id).split("|")[1]).toBe(first);
    as(`select pg_sleep(0.01); update public.orders set courier_status = 'in_transit' where id = '${id}'`);
    expect(stamps(id).split("|")[1] > first).toBe(true);
  });

  it("backfills current orders from their recorded history, once", () => {
    const id = order("processing", "in_transit");
    as(`update public.orders set processing_at = null, courier_status_at = null where id = '${id}'`);
    as(`insert into public.order_status_events(org_id,order_id,order_table,from_status,to_status,actor_kind,created_at)
      values ('${org}','${id}','orders','print','processing','system','2026-10-01T08:00:00Z')`);
    as(`insert into public.order_activity_events(id,org_id,order_id,order_table,event_type,category,actor_kind,source_surface,summary,metadata,created_at)
      values ('${randomUUID()}','${org}','${id}','orders','courier.status_changed','courier','courier_webhook','system','x','{}'::jsonb,'2026-10-03T09:00:00Z')`);
    const migration = readFileSync(join(import.meta.dirname, "../../supabase/migrations/20261009074910_order_progress_stamps.sql"), "utf8");
    db.sql(migration);
    expect(stamps(id)).toBe("2026-10-01T08:00:00.000000|2026-10-03T09:00:00.000000");
    db.sql(migration);
    expect(stamps(id)).toBe("2026-10-01T08:00:00.000000|2026-10-03T09:00:00.000000");
  });

  it("stores the courier's latest note without touching anything else", () => {
    const id = order("processing", "in_transit");
    as(`update public.orders set courier_note = 'Customer not reachable', courier_note_at = '2026-10-09T10:00:00Z' where id = '${id}'`);
    expect(as(`select courier_note || '|' || status || '|' || courier_status from public.orders where id = '${id}'`))
      .toBe("Customer not reachable|processing|in_transit");
  });

  it("keeps a real movement time given with the courier status change", () => {
    db.sql(readFileSync(join(import.meta.dirname, "../../supabase/migrations/20261009121557_courier_problem.sql"), "utf8"));
    const id = order("processing", "pending");
    as(`update public.orders set courier_status = 'in_transit', courier_status_at = '2026-10-05T06:00:00Z' where id = '${id}'`);
    expect(stamps(id).split("|")[1]).toBe("2026-10-05T06:00:00.000000");
    // Without a given time, a change is stamped now.
    as(`update public.orders set courier_status = 'delivered' where id = '${id}'`);
    expect(stamps(id).split("|")[1] > "2026-10-05T06:00:00.000000").toBe(true);
  });

  it("stores the rider's delivery problem without touching the status", () => {
    const id = order("processing", "in_transit");
    as(`update public.orders set courier_problem = 'Rider Note: "Rtn hobe"', courier_problem_at = '2026-10-09T10:00:00Z' where id = '${id}'`);
    expect(as(`select courier_problem || '|' || status || '|' || courier_status from public.orders where id = '${id}'`))
      .toBe('Rider Note: "Rtn hobe"|processing|in_transit');
  });

  it("records a follow-up without touching the status", () => {
    const id = order("processing", "in_transit");
    as(`update public.orders set followed_up_at = '2026-10-09T10:00:00Z', followed_up_by = '${org}', follow_up_note = 'Call again tomorrow' where id = '${id}'`);
    expect(as(`select follow_up_note || '|' || status || '|' || courier_status from public.orders where id = '${id}'`)).toBe("Call again tomorrow|processing|in_transit");
  });
});

