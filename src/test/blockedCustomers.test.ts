import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { deviceHashFromContext, isBlockedCustomer, orderBlockStatus } from "../../server/blockedCustomers.js";

const SECRET = "test-secret-at-least-16-chars";
const ORG = "3cd26e57-85ef-4970-94a4-cd99c0f1b554";

function fakeSupabase(result: { data?: unknown; error?: unknown }) {
  const calls: { or?: string; eq: unknown[] } = { eq: [] };
  const builder = {
    select: () => builder,
    eq: (...args: unknown[]) => { calls.eq.push(args); return builder; },
    or: (filter: string) => { calls.or = filter; return builder; },
    limit: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => void) => resolve(result),
  };
  return { client: { from: vi.fn(() => builder) }, calls };
}

describe("blocked customers", () => {
  it("hashes the verified device id and returns null without one", () => {
    const hash = deviceHashFromContext({ deviceId: "8b1f3c2a-1111-4222-8333-444455556666" }, SECRET);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(deviceHashFromContext(null, SECRET)).toBeNull();
    expect(deviceHashFromContext({ deviceId: "x" }, "short")).toBeNull();
  });

  it("matches on phone or device within the workspace", async () => {
    const { client, calls } = fakeSupabase({ data: [{ id: "1" }], error: null });
    await expect(isBlockedCustomer(client, { orgId: ORG, phone: "01700000000", deviceHash: "a".repeat(64) })).resolves.toBe(true);
    expect(client.from).toHaveBeenCalledWith("blocked_customers");
    expect(calls.eq).toContainEqual(["org_id", ORG]);
    expect(calls.or).toBe(`phone.eq.01700000000,device_hash.eq.${"a".repeat(64)}`);
  });

  it("allows the order when nothing matches or the lookup fails", async () => {
    await expect(isBlockedCustomer(fakeSupabase({ data: [], error: null }).client, { orgId: ORG, phone: "01800000003", deviceHash: null })).resolves.toBe(false);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(isBlockedCustomer(fakeSupabase({ data: null, error: new Error("down") }).client, { orgId: ORG, phone: "01800000003", deviceHash: null })).resolves.toBe(false);
  });

  it("reports which of an order's identities are blocked", async () => {
    const { client } = fakeSupabase({ data: [{ phone: "01700000000", device_hash: null }], error: null });
    await expect(orderBlockStatus(client, { orgId: ORG, order: { phone: "01700000000", device_hash: "b".repeat(64) } }))
      .resolves.toEqual({ phone: true, device: false });
  });
});

describe("checkout wiring", () => {
  const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
  const slice = (marker: string) => { const start = source.indexOf(marker); return source.slice(start, source.indexOf("\n}\n", start)); };

  it("refuses blocked customers before risk assessment and saves the device on website orders", () => {
    const handler = slice("async function handlePublicHandleOrderSubmit(req, res) {");
    const blockCheck = handler.indexOf("isBlockedCustomer(supabase, { orgId, phone: cleanPhone, deviceHash })");
    expect(blockCheck).toBeGreaterThan(0);
    expect(blockCheck).toBeLessThan(handler.indexOf("assessOrderRisk("));
    expect(handler).toContain("device_hash: deviceHash,");
  });

  it("refuses blocked customers on the custom-store webhook", () => {
    const webhook = source.slice(source.indexOf('app.post("/api/custom-orders/webhook"'), source.indexOf("assessOrderRisk(", source.indexOf('app.post("/api/custom-orders/webhook"')));
    expect(webhook).toContain("isBlockedCustomer(supabase, { orgId, phone: webhookPhone, deviceHash })");
  });

  it("guards the block routes with auth and the workspace org", () => {
    const loader = slice("async function loadOrderForBlocking(req) {");
    expect(loader).toContain("getUser(getToken(req))");
    expect(loader).toContain('.eq("org_id", orgId)');
  });

  it("only lets admins view, block or unblock", () => {
    for (const route of ['app.get("/api/orders/:id/block-status"', 'app.post("/api/orders/:id/block"']) {
      const start = source.indexOf(route);
      const handler = source.slice(start, source.indexOf("\n});\n", start));
      expect(start).toBeGreaterThan(0);
      expect(handler).toContain('if (role !== "admin") return res.status(403)');
    }
  });
});
