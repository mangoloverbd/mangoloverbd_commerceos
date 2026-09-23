import { describe, expect, it, vi } from "vitest";
import { readIdentityCounts, recordIdentityLinks } from "../../server/risk/links.js";

const hash = "a".repeat(64);
const ctx = {
  orgId: "20000000-0000-0000-0000-000000000001", now: 1_800_000_000_000,
  hashes: { phone: hash, device: "b".repeat(64), fingerprint: "c".repeat(64), network: "d".repeat(64) },
  network: { type: "mobile" },
};

function mockRedis() {
  const calls: Array<[string, ...unknown[]]> = [];
  const redis = Object.fromEntries(["sadd", "expire", "zadd", "zremrangebyscore", "scard", "zcard", "incr", "get"].map(method => [method, vi.fn(async (...args: unknown[]) => { calls.push([method, ...args]); return method === "get" ? "2" : 1; })]));
  return { redis, calls };
}

describe("expiring identity links", () => {
  it("records hashed sets and sliding networks, but no mobile shared-network phone set", async () => {
    const { redis, calls } = mockRedis();
    await recordIdentityLinks(redis, ctx);
    const text = JSON.stringify(calls);
    expect(text).toContain("op2:20000000-0000-0000-0000-000000000001:dev:phones:");
    expect(text).toContain("dev:nets:");
    expect(text).not.toContain("net:phones:");
    expect(calls.filter(call => call[0] === "incr")).toHaveLength(3);
    expect(calls).toContainEqual(["expire", expect.stringContaining("dev:phones:"), 604800]);
    expect(calls).toContainEqual(["expire", expect.stringContaining("dev:nets:"), 86400]);
  });

  it("abandoned capture links candidates without incrementing order counters", async () => {
    const { redis, calls } = mockRedis();
    await recordIdentityLinks(redis, { ...ctx, network: { type: "broadband" } }, { countAttempt: false });
    expect(calls.some(call => call[0] === "incr")).toBe(false);
    expect(JSON.stringify(calls)).toContain("net:phones:");
  });

  it("reads current-attempt counts and propagates Redis errors", async () => {
    const { redis, calls } = mockRedis();
    expect(await readIdentityCounts(redis, ctx)).toMatchObject({ links: { devicePhones7d: 1, phoneDevices7d: 1, deviceNetworks1h: 1, networkPhones24h: 0 }, attempts: { phone15m: 2, phone24h: 2, device15m: 2 } });
    expect(calls.filter(call => call[0] === "get")).toHaveLength(3);
    redis.get.mockRejectedValueOnce(new Error("offline"));
    await expect(readIdentityCounts(redis, ctx)).rejects.toThrow("offline");
  });
});
