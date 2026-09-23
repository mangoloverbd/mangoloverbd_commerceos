import { describe, expect, it, vi } from "vitest";
import { assessOrderRisk, finalizeOrderRisk } from "../../server/risk/pipeline.js";
import { signClientContext, CLIENT_CONTEXT_HEADER } from "../../server/clientContext.js";

const orgId = "20000000-0000-0000-0000-000000000001";
const secret = "risk-secret-with-more-than-sixteen-characters";
const contextSecret = "context-secret-with-more-than-thirty-two-characters";
const context = { v: 1, issuedAt: new Date().toISOString(), ip: "103.12.44.7", userAgent: "Browser", geo: { country: "BD", region: "BD-C", city: "Dhaka" }, deviceId: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e", fingerprint: null, telemetry: { firstInteractionAt: null, phoneCandidates: [], pastedFields: [] } };
const body = { customer_name: "Rahim Uddin", phone: "01712345678", address: "House 1 Road 2 Dhaka", items: [{ variantId: "v", productId: "p", quantity: 1 }] };

function deps(mode = "shadow") {
  const writes: Array<{ table: string; row: Record<string, unknown> }> = [];
  const supabase = { from(table: string) {
    let row: Record<string, unknown> = {};
    const query: Record<string, (...args: unknown[]) => unknown> = {};
    for (const method of ["select", "eq", "or", "in", "limit", "update", "insert", "single", "maybeSingle"]) query[method] = (...args: unknown[]) => {
      if (method === "insert" || method === "update") { row = args[0] as Record<string, unknown>; writes.push({ table, row }); }
      return query;
    };
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "order_risk_attempts" && row.decision ? { id: "30000000-0000-0000-0000-000000000001" } : table === "order_protection_reviews" && row.status ? { id: "40000000-0000-0000-0000-000000000001" } : [], error: null }).then(resolve);
    return query;
  } };
  const redis = { set: vi.fn().mockResolvedValue("OK"), expire: vi.fn().mockResolvedValue(1), zadd: vi.fn().mockResolvedValue(1), zremrangebyscore: vi.fn().mockResolvedValue(1), incr: vi.fn().mockResolvedValue(1), zcount: vi.fn().mockResolvedValue(1), get: vi.fn().mockResolvedValue(1) };
  return { supabase, redis, secret, contextSecret, getSetting: vi.fn().mockResolvedValue(mode), writes, createReview: vi.fn().mockResolvedValue({ id: "40000000-0000-0000-0000-000000000001" }), verifyTurnstile: vi.fn().mockResolvedValue({ ok: true }) };
}
const request = (dependencies: ReturnType<typeof deps>, overrides: Record<string, unknown> = {}) => ({ orgId, route: "public_v1", body, headers: { [CLIENT_CONTEXT_HEADER]: signClientContext(context, contextSecret) }, requestIp: "127.0.0.1", deps: dependencies, ...overrides });

describe("durable risk pipeline", () => {
  it("off bypasses assessment, shadow persists a would-be HOLD without enforcement", async () => {
    const off = deps("off");
    expect(await assessOrderRisk(request(off))).toMatchObject({ mode: "off", decision: "ALLOW", enforced: false, attemptId: null });
    expect(off.writes).toEqual([]);
    const shadow = deps();
    const assessed = await assessOrderRisk(request(shadow, { body: { ...body, website: "bot" } }));
    expect(assessed).toMatchObject({ mode: "shadow", decision: "HOLD", assessedDecision: "HOLD", enforced: false, attemptId: expect.any(String) });
    expect(shadow.writes).toEqual(expect.arrayContaining([expect.objectContaining({ table: "order_risk_attempts", row: expect.objectContaining({ decision: "HOLD", mode: "shadow" }) })]));
    // Staff rehearse on real would-be holds: a review row exists for the
    // Reviews tab, but nothing is enforced at checkout.
    expect(shadow.createReview).toHaveBeenCalledOnce();
    expect(assessed).toMatchObject({ reviewId: expect.any(String) });
  });

  it("missing signed context does not hold an otherwise normal order", async () => {
    const active = deps("active");
    const assessed = await assessOrderRisk(request(active, { headers: {} }));
    expect(assessed).toMatchObject({ decision: "ALLOW", enforced: true, reviewId: null, attemptId: expect.any(String) });
    expect(active.createReview).not.toHaveBeenCalled();
  });

  it("a normal signed customer is not blocked in active mode", async () => {
    const active = deps("active");
    const result = await assessOrderRisk(request(active));
    expect(result.decision).not.toBe("BLOCK");
  });

  it("a filled honeypot holds; a missing hash secret does not hold an ordinary order", async () => {
    const active = deps("active");
    expect(await assessOrderRisk(request(active, { body: { ...body, website: "bot" } }))).toMatchObject({ decision: "HOLD", enforced: true });
    const missing = deps("active"); missing.secret = "short";
    expect(await assessOrderRisk(request(missing))).toMatchObject({ decision: "ALLOW", reviewId: null });
  });

  it("if a hold cannot be saved the order proceeds instead of being lost", async () => {
    const active = deps("active"); active.createReview.mockRejectedValueOnce(new Error("db down"));
    const result = await assessOrderRisk(request(active, { body: { ...body, website: "bot" } }));
    expect(result).toMatchObject({ decision: "ALLOW", reviewId: null });
    expect(result.reasons).toContain("review_unavailable");
  });

  it("never throws: malformed risk input does not delay checkout", async () => {
    const odd = { ...body, phone: "not a phone", items: [{ variantId: "v", quantity: "2" }] };
    expect(await assessOrderRisk(request(deps(), { body: odd }))).toMatchObject({ decision: "ALLOW", enforced: false });
    expect(await assessOrderRisk(request(deps("active"), { body: odd }))).toMatchObject({ decision: "ALLOW", reasons: ["engine_error"] });
    expect(await assessOrderRisk(request(deps(), { body: { ...body, items: [{ variantId: "v", quantity: "2" }] } }))).toMatchObject({ enforced: false, attemptId: expect.any(String) });
  });

  it("Redis outage and attempt-log failure do not delay a normal customer", async () => {
    const noRedis = deps("active"); (noRedis as { redis: unknown }).redis = null;
    expect(await assessOrderRisk(request(noRedis))).toMatchObject({ decision: "ALLOW", reviewId: null });
    const noLog = deps("active");
    const from = noLog.supabase.from;
    noLog.supabase.from = (table: string) => { if (table === "order_risk_attempts") throw new Error("down"); return from(table); };
    const result = await assessOrderRisk(request(noLog));
    expect(result.decision).not.toBe("BLOCK");
  });

  it("links the risk attempt after order creation", async () => {
    const d = deps("active");
    await finalizeOrderRisk({ supabase: d.supabase, orgId, attemptId: "30000000-0000-0000-0000-000000000001", orderId: "50000000-0000-0000-0000-000000000001" });
    expect(d.writes.some(write => write.table === "orders" && write.row.risk_attempt_id)).toBe(true);
  });
  it("does not strand authenticated custom webhook orders in an unapprovable review", async () => {
    const d = deps("active");
    const assessed = await assessOrderRisk(request(d, { route: "custom_webhook", body: { ...body, website: "filled" }, headers: {} }));
    expect(assessed).toMatchObject({ decision: "ALLOW", assessedDecision: "HOLD", reviewId: null });
    expect(d.createReview).not.toHaveBeenCalled();
    expect(d.writes).toEqual(expect.arrayContaining([expect.objectContaining({ table: "order_risk_attempts", row: expect.objectContaining({ decision: "ALLOW", reasons: expect.arrayContaining(["webhook_review_unsupported"]) }) })]));
  });
});
