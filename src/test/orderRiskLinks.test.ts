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
    await expect(recordIdentityLinks(null, ctx)).rejects.toThrow();
  });
});
