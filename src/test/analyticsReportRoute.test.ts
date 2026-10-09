import { describe, expect, it, vi } from "vitest";
import { database, handlers, http, orgId } from "./campaignHandlerHarness";
import { buildDataHealth, normalizeWebsiteReport, resolveAnalyticsReportRequest } from "../../server/analyticsReport.js";

const now = new Date("2026-10-03T06:00:00Z"); // 12:00 in Dhaka

describe("analytics report request", () => {
  it("defaults to the last 30 Dhaka days with an equal previous period", () => {
    const { request, previousRequest } = resolveAnalyticsReportRequest({}, now);
    expect(request).toMatchObject({ range: { from: "2026-09-04", to: "2026-10-03" }, since: "2026-09-03T18:00:00.000Z", until: "2026-10-03T18:00:00.000Z" });
    // Today is partial, so the previous period stops at the same time of day.
    expect(previousRequest).toMatchObject({ range: { from: "2026-08-05", to: "2026-09-03" }, since: "2026-08-04T18:00:00.000Z", until: "2026-09-03T06:00:00.000Z" });
  });
  it("rejects half, future and oversized ranges with 400", () => {
    // "Future" is judged against the real clock, so the test date must be too.
    const future = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    for (const query of [{ from: "2026-10-01" }, { from: future, to: future }, { from: "2025-01-01", to: "2026-10-01" }]) {
      expect(() => resolveAnalyticsReportRequest(query, now)).toThrow(expect.objectContaining({ statusCode: 400 }));
    }
  });
});

describe("analytics report shaping", () => {
  it("fills quiet days and hours and turns numeric strings into numbers", () => {
    const report = normalizeWebsiteReport({ totals: { sessions: 3 }, daily: [{ day: "2026-10-02", sessions: 3, visitors: 2, pageviews: 4, ordered_sessions: 1 }],
      hourly: [{ hour: 10, sessions: 3 }], acquisition: { last: [{ source: "facebook", medium: "paid", orders: 2, delivered_value: "1200.50" }], website_orders: 4, matched_orders: 2 } },
    { from: "2026-10-01", to: "2026-10-03" });
    expect(report.daily.map((row) => [row.day, row.sessions])).toEqual([["2026-10-01", 0], ["2026-10-02", 3], ["2026-10-03", 0]]);
    expect(report.hourly).toHaveLength(24);
    expect(report.hourly[10]).toEqual({ hour: 10, sessions: 3 });
    expect(report.totals).toMatchObject({ sessions: 3, orders: 0 });
    expect(report.acquisition.last[0]).toMatchObject({ source: "facebook", delivered_value: 1200.5 });
  });

  it("estimates funnel reach from the raw steps when the database has not added it yet", () => {
    const range = { from: "2026-10-08", to: "2026-10-08" };
    const raw = { sessions: 3106, product_sessions: 1736, cart_sessions: 18, checkout_sessions: 146, ordered_sessions: 77 };
    expect(normalizeWebsiteReport({ totals: raw }, range).totals).toMatchObject({ reached_product_sessions: 1736, reached_checkout_sessions: 146 });
    expect(normalizeWebsiteReport({ totals: { ...raw, checkout_sessions: 10, product_sessions: 5 } }, range).totals)
      .toMatchObject({ reached_product_sessions: 77, reached_checkout_sessions: 77 });
    // The database's exact numbers always win.
    expect(normalizeWebsiteReport({ totals: { ...raw, reached_product_sessions: 3037, reached_checkout_sessions: 147 } }, range).totals)
      .toMatchObject({ reached_product_sessions: 3037, reached_checkout_sessions: 147 });
  });
  it("reports collection freshness, rollup state and order coverage", () => {
    const current = normalizeWebsiteReport({ totals: { sessions: 10 }, sources: [{ source: "direct", medium: "none", sessions: 4 }], acquisition: { website_orders: 8, matched_orders: 6 } }, { from: "2026-10-03", to: "2026-10-03" });
    expect(buildDataHealth({ latestEventAt: "2026-10-03T05:30:00Z", job: { last_succeeded_at: "2026-10-02T20:35:00Z" }, current }, now))
      .toMatchObject({ collecting: true, rollup: { healthy: true, last_failed_at: null }, order_coverage: 0.75, direct_share: 0.4 });
    expect(buildDataHealth({ latestEventAt: null, job: { last_succeeded_at: "2026-09-30T20:35:00Z", last_failed_at: "2026-10-02T20:35:00Z" }, current: normalizeWebsiteReport({}, { from: "2026-10-03", to: "2026-10-03" }) }, now))
      .toMatchObject({ collecting: false, rollup: { healthy: false, last_failed_at: "2026-10-02T20:35:00.000Z" }, order_coverage: null, direct_share: null });
  });
});

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
function fixture({ role = "admin", rpc = (async () => ({ data: {}, error: null })) as Rpc } = {}) {
  const db = database({ analytics_events: [{ org_id: orgId, received_at: "2026-10-03T05:59:00Z" }], user_roles: [{ org_id: orgId }], analytics_job_state: [] });
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const upserts: unknown[] = [];
  const supabase = {
    from: (table: string) => {
      const query = db.from(table) as ReturnType<typeof db.from> & { not: () => unknown; upsert: (row: unknown) => Promise<{ error: null }> };
      return Object.assign(query, { not: () => query, upsert: async (row: unknown) => { upserts.push(row); return { error: null }; } });
    },
    rpc: (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return rpc(name, args); },
  };
  const harness = handlers(db, {
    getServiceSupabase: () => supabase,
    getUserOrg: async () => ({ orgId, role }),
    resolveAnalyticsReportRequest: (query: Record<string, unknown>) => resolveAnalyticsReportRequest(query, now),
    normalizeWebsiteReport, buildDataHealth: (input: Parameters<typeof buildDataHealth>[0]) => buildDataHealth(input, now),
    isAuthorizedCronRequest: (header: string | undefined, secret: string) => header === `Bearer ${secret}`,
    sendError: (res: { status: (status: number) => { json: (body: unknown) => unknown } }, error: { statusCode?: number; message: string }) => res.status(error.statusCode || 500).json({ error: error.message }),
  });
  harness.load(["ANALYTICS_MAINTENANCE_MAX_PASSES"], ['app.get("/api/analytics/website"', 'app.get("/api/internal/analytics-rollup"']);
  return { ...harness, calls, upserts };
}

describe("GET /api/analytics/website", () => {
  it("requires a signed-in admin", async () => {
    expect((await http(fixture().app, "GET", "/api/analytics/website", undefined, {})).status).toBe(401);
    expect((await http(fixture({ role: "team_member" }).app, "GET", "/api/analytics/website")).status).toBe(403);
  });
  it("reports the current and previous period for the fixed workspace only", async () => {
    const { app, calls } = fixture();
    const result = await http(app, "GET", "/api/analytics/website?from=2026-10-01&to=2026-10-02&org_id=someone-else");
    expect(result.status).toBe(200);
    expect(calls.map((call) => call.args)).toEqual([
      { p_org_id: orgId, p_since: "2026-09-30T18:00:00.000Z", p_until: "2026-10-02T18:00:00.000Z" },
      { p_org_id: orgId, p_since: "2026-09-28T18:00:00.000Z", p_until: "2026-09-30T18:00:00.000Z" },
    ]);
    expect(result.body).toMatchObject({ range: { from: "2026-10-01", to: "2026-10-02" }, previous_range: { from: "2026-09-29", to: "2026-09-30" },
      health: { collecting: true, latest_event_at: "2026-10-03T05:59:00.000Z" } });
    expect(result.body.current.daily).toHaveLength(2);
  });
  it("says when analytics is not set up instead of failing obscurely", async () => {
    const { app } = fixture({ rpc: async () => ({ data: null, error: { code: "PGRST202", message: "missing" } }) });
    const result = await http(app, "GET", "/api/analytics/website");
    expect(result.status).toBe(503);
    expect(result.body.code).toBe("analytics_not_ready");
  });
  it("rejects invalid ranges", async () => {
    expect((await http(fixture().app, "GET", "/api/analytics/website?from=2026-10-05&to=2026-10-01")).status).toBe(400);
  });
});

describe("GET /api/internal/analytics-rollup", () => {
  it("runs only with the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-test");
    const { app, calls } = fixture();
    expect((await http(app, "GET", "/api/internal/analytics-rollup", undefined, { authorization: "Bearer wrong" })).status).toBe(401);
    expect(calls).toHaveLength(0);
    vi.unstubAllEnvs();
  });
  it("repeats bounded passes while expired rows remain, at most five", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-test");
    const { app, calls } = fixture({ rpc: async () => ({ data: { from: "2026-09-26", to: "2026-10-03", more: true }, error: null }) });
    const result = await http(app, "GET", "/api/internal/analytics-rollup", undefined, { authorization: "Bearer cron-secret-test" });
    expect(result.status).toBe(200);
    expect(calls.filter((call) => call.name === "run_analytics_maintenance")).toHaveLength(5);
    expect(calls[0].args.p_org_id).toBe(orgId);
    vi.unstubAllEnvs();
  });
  it("records a failure for the Data health tab", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-test");
    const { app, upserts } = fixture({ rpc: async () => ({ data: null, error: { code: "57014", message: "statement timeout" } }) });
    expect((await http(app, "GET", "/api/internal/analytics-rollup", undefined, { authorization: "Bearer cron-secret-test" })).status).toBe(500);
    expect(upserts).toEqual([expect.objectContaining({ org_id: orgId, job: "rollup", last_error: "57014" })]);
    vi.unstubAllEnvs();
  });
});
