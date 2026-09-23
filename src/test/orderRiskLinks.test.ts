import { describe, expect, it, vi } from "vitest";
import { readIdentityCounts, recordIdentityLinks } from "../../server/risk/links.js";

const hash = "a".repeat(64);
const now = 1_800_000_000_000;
const ctx = {
  orgId: "20000000-0000-0000-0000-000000000001", now,
  hashes: { phone: hash, device: "b".repeat(64), fingerprint: "c".repeat(64), network: "d".repeat(64) },
  network: { type: "mobile" },
};

function mockRedis() {
  const calls: Array<[string, ...unknown[]]> = [];
  const redis = Object.fromEntries(["zadd", "zremrangebyscore", "expire", "zcount", "set", "incr", "get"].map(method => [method, vi.fn(async (...args: unknown[]) => {
    calls.push([method, ...args]);
    return method === "get" ? "2" : 1;
  })]));
  return { redis, calls };
}

describe("expiring identity links", () => {
  it("records hashed sliding windows, but no shared-network phone set on mobile", async () => {
    const { redis, calls } = mockRedis();
    await recordIdentityLinks(redis, ctx);
    const text = JSON.stringify(calls);
    expect(text).toContain("op2:20000000-0000-0000-0000-000000000001:dev:phones:");
    expect(text).toContain("dev:nets:");
    expect(text).not.toContain("net:phones:");
    expect(calls).toContainEqual(["zremrangebyscore", expect.stringContaining("dev:phones:"), 0, now - 604800 * 1000]);
    expect(calls).toContainEqual(["zremrangebyscore", expect.stringContaining("dev:nets:"), 0, now - 3600 * 1000]);
    // Counter windows get their TTL before the increment, so they cannot become permanent.
    expect(calls.filter(call => call[0] === "set")).toHaveLength(3);
    expect(calls).toContainEqual(["set", expect.stringContaining("cnt:phone:15m:"), 0, { nx: true, ex: 900 }]);
    expect(calls.filter(call => call[0] === "incr")).toHaveLength(3);
  });

  it("abandoned capture links candidates without incrementing order counters", async () => {
    const { redis, calls } = mockRedis();
    await recordIdentityLinks(redis, { ...ctx, network: { type: "broadband" } }, { countAttempt: false });
    expect(calls.some(call => call[0] === "incr")).toBe(false);
    expect(JSON.stringify(calls)).toContain("net:phones:");
  });

  it("counts only inside each window and propagates Redis errors", async () => {
    const { redis, calls } = mockRedis();
    expect(await readIdentityCounts(redis, ctx)).toMatchObject({ links: { devicePhones7d: 1, phoneDevices7d: 1, deviceNetworks1h: 1, networkPhones24h: 0 }, attempts: { phone15m: 2, phone24h: 2, device15m: 2 } });
    expect(calls).toContainEqual(["zcount", expect.stringContaining("dev:phones:"), now - 604800 * 1000, "+inf"]);
    redis.get.mockRejectedValueOnce(new Error("offline"));
    await expect(readIdentityCounts(redis, ctx)).rejects.toThrow("offline");
  });

  it("resolves without Redis because the attempt row is the record", async () => {
    await expect(recordIdentityLinks(null, ctx)).resolves.toBeUndefined();
  });
});

function mockSupabase(rows: Array<Record<string, unknown>>, count: number) {
  const queries: Array<{ column: string; filters: Array<[string, ...unknown[]]> }> = [];
  const supabase = { from: vi.fn(() => {
    const filters: Array<[string, ...unknown[]]> = [];
    let selected = false;
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    for (const method of ["select", "eq", "gte", "limit"]) chain[method] = (...args: unknown[]) => {
      // Mirror the real client: filters before .select() do not exist.
      if (method !== "select" && !selected) throw new TypeError(`supabase.from(...).${method} is not a function`);
      if (method === "select") { selected = true; queries.push({ column: String(args[0]), filters }); }
      else filters.push([method, ...args]);
      return chain;
    };
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, count, error: null }).then(resolve);
    return chain;
  }) };
  return { supabase, queries };
}

describe("supabase velocity fallback", () => {
  it("counts attempts and distinct identities from attempt rows, including the in-flight order", async () => {
    const { supabase, queries } = mockSupabase(
      [{ phone_hash: "x".repeat(64), device_hash: "y".repeat(64), network_hash: "z".repeat(64) }],
      2,
    );
    const counts = await readIdentityCounts(null, ctx, { supabase });
    expect(counts).toMatchObject({
      links: { devicePhones7d: 2, phoneDevices7d: 2, deviceNetworks1h: 2, networkPhones24h: 0 },
      attempts: { phone15m: 3, phone24h: 3, device15m: 3 },
    });
    // Every query stays inside the workspace and its time window.
    expect(supabase.from).toHaveBeenCalledWith("order_risk_attempts");
    for (const query of queries) expect(query.filters).toContainEqual(["eq", "org_id", ctx.orgId]);
    expect(queries.some(query => query.filters.some(filter => filter[0] === "gte"))).toBe(true);
    // Mobile carrier NAT is shared, so its network count stays zero.
    expect(counts.links.networkPhones24h).toBe(0);
  });

  it("counts shared broadband networks but skips missing identities", async () => {
    const { supabase } = mockSupabase([], 0);
    const broadband = { ...ctx, network: { type: "broadband" }, hashes: { ...ctx.hashes, device: null as unknown as string } };
    const counts = await readIdentityCounts(null, broadband, { supabase });
    expect(counts.links.devicePhones7d).toBe(0);
    expect(counts.links.deviceNetworks1h).toBe(0);
    expect(counts.attempts.device15m).toBe(0);
    expect(counts.attempts.phone15m).toBe(1);
  });

  it("falls back to Supabase when Redis is present but failing, and never throws on link writes", async () => {
    const { redis } = mockRedis();
    for (const method of ["zadd", "zremrangebyscore", "expire", "zcount", "set", "incr", "get"]) redis[method].mockRejectedValue(new Error("quota exhausted"));
    const { supabase } = mockSupabase([{ phone_hash: "x".repeat(64) }], 1);
    const counts = await readIdentityCounts(redis, ctx, { supabase });
    expect(counts).toMatchObject({ attempts: { phone15m: 2, phone24h: 2 } });
    await expect(recordIdentityLinks(redis, ctx)).resolves.toBeUndefined();
  });

  it("throws when neither Redis nor Supabase is available, and propagates database errors", async () => {
    await expect(readIdentityCounts(null, ctx)).rejects.toThrow();
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    for (const method of ["select", "eq", "gte", "limit"]) chain[method] = () => chain;
    chain.then = (_resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => reject(new Error("db down"));
    const failing = { from: () => chain };
    await expect(readIdentityCounts(null, ctx, { supabase: failing })).rejects.toThrow("db down");
  });
});
