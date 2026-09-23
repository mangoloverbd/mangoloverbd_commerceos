import { describe, expect, it, vi } from "vitest";
import { gatherRiskFacts } from "../../server/risk/gather.js";

const ctx = { orgId: "20000000-0000-0000-0000-000000000001", customer: { phone: "01712345678" }, hashes: { phone: "a".repeat(64), device: "b".repeat(64), fingerprint: "c".repeat(64), network: null }, network: { type: "mobile" }, now: Date.now() };

function database() {
  const calls: Array<{ table: string; methods: Array<[string, ...unknown[]]> }> = [];
  const supabase = { from(table: string) {
    const query = { table, methods: [] as Array<[string, ...unknown[]]> }; calls.push(query);
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    for (const method of ["select", "eq", "or", "in", "limit", "gte"]) chain[method] = (...args: unknown[]) => { query.methods.push([method, ...args]); return chain; };
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return chain;
  } };
  return { supabase, calls };
}

describe("risk fact gathering", () => {
  it("scopes every order and list query, and normalizes courier results", async () => {
    const { supabase, calls } = database();
    const redis = { scard: async () => 1, zcard: async () => 1, get: async () => 1 };
    const fraudLookup = vi.fn().mockResolvedValue({ totalParcels: 5, successRate: 90 });
    const facts = await gatherRiskFacts(ctx, { redis, supabase, fraudLookup });
    expect(facts).toMatchObject({ courier: { totalParcels: 5, successRate: 90 }, unavailable: [] });
    expect(fraudLookup).toHaveBeenCalledWith("01712345678", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(calls.some(call => call.table === "orders")).toBe(true);
    expect(calls.some(call => call.table === "order_risk_list_entries")).toBe(true);
    for (const call of calls) expect(call.methods).toContainEqual(["eq", "org_id", ctx.orgId]);
  });

  it("marks Redis and database failure unavailable, but skips FraudShield timeout", async () => {
    const { supabase } = database();
    supabase.from = () => { throw new Error("database down"); };
    const facts = await gatherRiskFacts(ctx, { redis: null, supabase, fraudLookup: () => Promise.reject(new Error("timeout")) });
    expect(facts.unavailable).toEqual(expect.arrayContaining(["redis", "supabase", "fraudshield"]));
    expect(facts.courier).toBeNull();
  });
});
