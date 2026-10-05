import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261006001500_live_visitor_locations.sql"), "utf8");

describe("live visitor locations migration", () => {
  it("adds bounded, nullable coordinates to visits", () => {
    expect(sql).toContain("add column latitude numeric(8, 5) constraint analytics_sessions_latitude_check check (latitude between -90 and 90)");
    expect(sql).toContain("add column longitude numeric(8, 5) constraint analytics_sessions_longitude_check check (longitude between -180 and 180)");
    expect(sql).not.toMatch(/drop (table|column)/i);
  });

  it("keeps the hit recorder and location reader server-only", () => {
    expect(sql).toContain("revoke all on function public.record_analytics_hit(uuid, uuid, uuid, uuid, text, text, text, integer, timestamptz, jsonb) from public, anon, authenticated");
    expect(sql).toContain("revoke all on function public.live_visitor_locations(uuid, integer) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.live_visitor_locations(uuid, integer) to service_role");
  });

  it("reads only the requested workspace and exposes no identifiers", () => {
    const reader = sql.slice(sql.indexOf("create or replace function public.live_visitor_locations"));
    expect(reader).toContain("where p.org_id = p_org_id");
    expect(reader).toContain("returns table (city text, country text, latitude numeric, longitude numeric, path text, last_seen_at timestamptz)");
    expect(reader).toContain("limit 20");
  });
});
