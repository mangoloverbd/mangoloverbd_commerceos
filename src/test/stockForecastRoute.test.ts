import { describe, expect, it } from "vitest";
import { database, handlers, http, orgId, foreignOrg } from "./campaignHandlerHarness";
import { HISTORY_DAYS, buildStockForecast } from "../../server/stockForecast.js";

function fixture({ role = "admin", rpcError = false } = {}) {
  const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const db = database({
    orders: [
      { id: "o1", org_id: orgId, created_at: recent, status: "pending", price: 1200, courier_fee: 100, order_items: [{ product_id: "p1", quantity: 2, unit_price: 600 }] },
      { id: "o2", org_id: foreignOrg, created_at: recent, status: "pending", price: 9999, courier_fee: 0, order_items: [{ product_id: "p1", quantity: 50, unit_price: 200 }] },
    ],
    products: [{ id: "p1", org_id: orgId, name: "কাটিমন আম | Katimon Mango", slug: "katimon-mango", cog: null }, { id: "p9", org_id: foreignOrg, name: "Other shop", slug: "x", cog: null }],
    product_variants: [{ id: "v1", org_id: orgId, product_id: "p1", stock_quantity: 10 }],
  });
  const rpcCalls: unknown[] = [];
  const supabase = {
    // The fake query drops nested selects such as order_items(...); return whole rows instead.
    from: (table: string) => {
      const query = db.from(table) as ReturnType<typeof db.from> & { select: (fields?: string) => unknown };
      if (table !== "orders") return query;
      const select = query.select.bind(query);
      return Object.assign(query, { select: () => select("*") });
    },
    rpc: (_name: string, args: unknown) => { rpcCalls.push(args); return Promise.resolve(rpcError ? { data: null, error: { code: "PGRST202" } } : { data: { products: [{ product_slug: "katimon-mango", views: 900, sessions: 700, orders: 14 }] }, error: null }); },
  };
  const harness = handlers(db, {
    getServiceSupabase: () => supabase,
    getUserOrg: async () => ({ orgId, role }),
    buildStockForecast, STOCK_FORECAST_HISTORY_DAYS: HISTORY_DAYS,
    sendError: (res: { status: (status: number) => { json: (body: unknown) => unknown } }, error: { statusCode?: number; message: string }) => res.status(error.statusCode || 500).json({ error: error.message }),
  });
  harness.load(["fetchReportPages"], ['app.get("/api/analytics/stock-forecast"']);
  return { ...harness, rpcCalls };
}

describe("GET /api/analytics/stock-forecast", () => {
  it("is for signed-in admins only", async () => {
    expect((await http(fixture().app, "GET", "/api/analytics/stock-forecast", undefined, {})).status).toBe(401);
    expect((await http(fixture({ role: "team_member" }).app, "GET", "/api/analytics/stock-forecast")).status).toBe(403);
  });

  it("plans from this workspace's orders, products and variant stock only", async () => {
    const { app, rpcCalls } = fixture();
    const result = await http(app, "GET", "/api/analytics/stock-forecast");
    expect(result.status).toBe(200);
    expect(result.body.restock).toEqual([expect.objectContaining({ name: "Katimon Mango", stock: 10, sold_per_day: Number((2 / 14).toFixed(2)) })]);
    expect(result.body.health[0]).toMatchObject({ name: "Katimon Mango", views: 900, order_rate: 2 });
    expect(rpcCalls).toEqual([expect.objectContaining({ p_org_id: orgId })]);
  });

  it("still works when website analytics is unavailable", async () => {
    const result = await http(fixture({ rpcError: true }).app, "GET", "/api/analytics/stock-forecast");
    expect(result.status).toBe(200);
    expect(result.body.health[0]).toMatchObject({ views: null, order_rate: null });
  });
});
