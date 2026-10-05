import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261005215829_live_visitor_presence.sql"), "utf8");

describe("live visitor presence migration", () => {
  it("keeps presence server-only and short-lived", () => {
    expect(sql).toContain("create unlogged table public.live_visitor_presence");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.live_visitor_presence from public, anon, authenticated");
    expect(sql).toContain("revoke all on function public.touch_live_visitor(uuid, text, text) from public, anon, authenticated");
    expect(sql).toContain("revoke all on function public.count_live_visitors(uuid, integer) from public, anon, authenticated");
    expect(sql).toContain("delete from public.live_visitor_presence where last_seen_at < now() - interval '10 minutes'");
  });

  it("counts only the requested workspace", () => {
    expect(sql).toContain("where org_id = p_org_id and last_seen_at > now() - make_interval(secs => p_window_seconds)");
  });
});
