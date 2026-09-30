import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as profileHelpers from "../../server/customerProfile.js";
import { filterLegacyActivityEvents } from "../../server/activityLog.js";

const phone = "01712345678";
const orgId = "workspace";
const userId = "staff";
const noteId = "11111111-1111-4111-8111-111111111111";
type Row = Record<string, unknown>;

// Executes the real production route registration and helpers without starting
// the monolithic server or its unrelated background integrations.
function harness({ user = { id: userId }, rows = {}, dbError = null }: { user?: { id: string } | null; rows?: Record<string, Row[]>; dbError?: { code: string; message: string } | null } = {}) {
  const registered = new Map<string, (req: Row, res: Row) => Promise<void>>();
  const requests: { table: string; filters: [string, unknown][]; write: string | null }[] = [];
  const db = Object.fromEntries(Object.entries(rows).map(([key, value]) => [key, value.map((row) => ({ ...row }))]));
  const supabase = {
    from(table: string) {
      const request = { table, filters: [] as [string, unknown][], write: null as string | null };
      requests.push(request);
      let data: Row | null = null;
      let range: [number, number] | null = null;
      let single = false;
      const sort: { key: string; ascending: boolean }[] = [];
      const query = {
        select: () => query,
        eq(key: string, value: unknown) { request.filters.push([key, value]); return query; },
        in(key: string, value: unknown[]) { request.filters.push([key, value]); return query; },
        neq(key: string, value: unknown) { request.filters.push([`!${key}`, value]); return query; },
        order(key: string, options: { ascending?: boolean }) { sort.push({ key, ascending: options.ascending !== false }); return query; },
        range(from: number, to: number) { range = [from, to]; return query; },
        limit(count: number) { range = [0, count - 1]; return query; },
        maybeSingle() { single = true; return query; },
        insert(value: Row) { request.write = "insert"; data = value; return query; },
        update(value: Row) { request.write = "update"; data = value; return query; },
        then(resolve: (value: { data: Row | Row[] | null; error: unknown; count: number }) => unknown) {
          if (dbError) return Promise.resolve(resolve({ data: null, error: dbError, count: 0 }));
          db[table] ||= [];
          let selected = db[table].filter((row) => request.filters.every(([key, value]) => key.startsWith("!") ? row[key.slice(1)] !== value : Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
          if (request.write === "insert" && data) {
            if (db[table].some((row) => table === "customer_profiles" ? row.org_id === data?.org_id && row.customer_key === data?.customer_key : row.id === data?.id)) return Promise.resolve(resolve({ data: null, error: { code: "23505", message: "Duplicate" }, count: 0 }));
            const inserted = { created_at: "2026-09-30T00:00:00Z", ...data };
            db[table].push(inserted);
            selected = [inserted];
          }
          if (request.write === "update" && data) selected.forEach((row) => Object.assign(row, data));
          selected = [...selected].sort((a, b) => { for (const entry of sort) { const cmp = String(a[entry.key] || "").localeCompare(String(b[entry.key] || "")); if (cmp) return entry.ascending ? cmp : -cmp; } return 0; });
          const count = selected.length;
          if (range) selected = selected.slice(range[0], range[1] + 1);
          return Promise.resolve(resolve({ data: single ? selected[0] || null : selected, error: null, count }));
        },
      };
      return query;
    },
  };
  const app = Object.fromEntries(["get", "post", "patch"].map((method) => [method, (path: string, handler: (req: Row, res: Row) => Promise<void>) => registered.set(`${method}:${path}`, handler)]));
  const source = readFileSync("server/index.js", "utf8");
  const start = source.indexOf("// ── Customer profile endpoints");
  const end = source.indexOf("// ── Order attribution", start);
  expect(start, "production customer profile route block is registered").toBeGreaterThan(-1);
  const deps = { app, getToken: () => "jwt", getUser: async () => ({ user }), getServiceSupabase: () => supabase, getUserOrg: async () => ({ orgId }), filterLegacyActivityEvents, ...profileHelpers };
  new Function(...Object.keys(deps), source.slice(start, end))(...Object.values(deps));
  return {
    db, requests,
    async call(method: string, path: string, body = {}, query = {}, id = phone) {
      const output = { statusCode: 200, body: {} as Row };
      const res = { status(code: number) { output.statusCode = code; return res; }, json(value: Row) { output.body = value; return res; }, set: vi.fn() };
      const handler = registered.get(`${method}:${path}`);
      expect(handler).toBeDefined();
      await handler!({ params: { id }, body, query }, res);
      return output;
    },
  };
}

const baseRows = () => ({ orders: [{ id: noteId, org_id: orgId, customer_phone_key: phone, phone, customer_name: "Rina", price: 500, status: "delivered", created_at: "2026-09-01T00:00:00Z" }], user_roles: [{ org_id: orgId, user_id: userId, display_name: "Support" }] });

describe("customer profile APIs", () => {
  it("rejects unauthenticated reads and writes before data access", async () => {
    const api = harness({ user: null });
    for (const [method, path] of [["get", "/api/customers/:id"], ["patch", "/api/customers/:id/context"], ["post", "/api/customers/:id/notes"]]) expect((await api.call(method, path)).statusCode).toBe(401);
    expect(api.requests).toHaveLength(0);
  });
  it("filters every query by workspace and excludes another workspace's phone match", async () => {
    const api = harness({ rows: { ...baseRows(), orders: [...baseRows().orders, { ...baseRows().orders[0], org_id: "other", price: 9999 }] } });
    const result = await api.call("get", "/api/customers/:id");
    expect(result.statusCode).toBe(200);
    expect(result.body.profile).toMatchObject({ summary: { totalOrders: 1, deliveredValue: 500 } });
    expect(api.requests.every((request) => request.filters.some(([key, value]) => key === "org_id" && value === orgId))).toBe(true);
  });
  it("returns 404 for unknown customers and 422 for invalid identities/pages", async () => {
    const api = harness();
    expect((await api.call("get", "/api/customers/:id")).statusCode).toBe(404);
    expect((await api.call("get", "/api/customers/:id", {}, {}, "name:Rina")).statusCode).toBe(422);
    expect((await api.call("get", "/api/customers/:id", {}, { ordersPage: "-1" })).statusCode).toBe(422);
  });
  it("returns actionable 503 when the migration is missing", async () => {
    const api = harness({ dbError: { code: "42703", message: "customer_phone_key missing" } });
    const result = await api.call("get", "/api/customers/:id");
    expect(result.statusCode).toBe(503);
    expect(result.body.code).toBe("customer_profile_schema_required");
  });
  it("aggregates beyond 1,000 rows while paging history independently", async () => {
    const api = harness({ rows: { ...baseRows(), orders: Array.from({ length: 1001 }, (_, index) => ({ ...baseRows().orders[0], id: String(index).padStart(5, "0") })) } });
    const result = await api.call("get", "/api/customers/:id", {}, { ordersPage: "41" });
    expect(result.body.profile).toMatchObject({ summary: { totalOrders: 1001, deliveredValue: 500500 } });
    expect(result.body.orders).toMatchObject({ total: 1001, page: 41, totalPages: 41, items: [expect.any(Object)] });
  });
  it("saves context separately from orders and rejects stale/first-save conflicts", async () => {
    const api = harness({ rows: baseRows() });
    const context = { tags: ["Honey buyer"], followUpOn: "2026-10-10", followUpReason: "Check stock", expectedVersion: 0 };
    expect((await api.call("patch", "/api/customers/:id/context", context)).body.context).toMatchObject({ tags: ["Honey buyer"], version: 1 });
    expect((await api.call("patch", "/api/customers/:id/context", context)).statusCode).toBe(409);
    expect((await api.call("patch", "/api/customers/:id/context", { ...context, expectedVersion: 1 })).body.context).toMatchObject({ version: 2 });
    expect((await api.call("patch", "/api/customers/:id/context", { ...context, tags: ["Stale overwrite"], expectedVersion: 1 })).statusCode).toBe(409);
    expect(api.db.customer_profiles[0]).toMatchObject({ version: 2, tags: ["Honey buyer"] });
    expect(api.requests.filter((request) => request.write).every((request) => request.table === "customer_profiles")).toBe(true);
  });
  it("does not show a linked legacy event as a second lifecycle activity", async () => {
    const api = harness({ rows: { ...baseRows(), order_activity_events: [{ id: "detailed", org_id: orgId, order_id: noteId, order_table: "orders", category: "lifecycle", summary: "Order created", created_at: "2026-09-01T00:00:00Z", metadata: { legacy_status_event_id: "legacy" } }], order_status_events: [{ id: "legacy", org_id: orgId, order_id: noteId, order_table: "orders", to_status: "pending", created_at: "2026-09-01T00:00:00Z" }] } });
    const result = await api.call("get", "/api/customers/:id");
    expect(result.body.activity).toMatchObject({ total: 1, items: [{ summary: "Order created" }] });
  });
  it("takes the note author from the workspace and handles matching retries idempotently", async () => {
    const api = harness({ rows: baseRows() });
    const note = { id: noteId, body: "Call after 6 pm" };
    const result = await api.call("post", "/api/customers/:id/notes", note);
    expect(result.body.note).toMatchObject({ body: "Call after 6 pm", authorName: "Support", authorId: userId });
    expect((await api.call("post", "/api/customers/:id/notes", note)).statusCode).toBe(200);
    expect(api.db.customer_notes).toHaveLength(1);
    expect((await api.call("post", "/api/customers/:id/notes", { ...note, body: "Different" })).statusCode).toBe(409);
  });
  it("does not disclose an existing note from another customer or workspace", async () => {
    const api = harness({ rows: { ...baseRows(), customer_notes: [{ id: noteId, org_id: "other", customer_key: phone, body: "Private", author_id: userId }] } });
    const result = await api.call("post", "/api/customers/:id/notes", { id: noteId, body: "Call" });
    expect(result.statusCode).toBe(409);
    expect(JSON.stringify(result.body)).not.toContain("Private");
  });
});
