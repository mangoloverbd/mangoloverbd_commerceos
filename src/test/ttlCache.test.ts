import { describe, expect, it, vi } from "vitest";
import { createTtlCache } from "../../server/ttlCache.js";

const value = { revenue: 100, adSpend: null };

function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, v: unknown) => { store.set(key, v); return "OK"; }),
  };
}

describe("createTtlCache", () => {
  it("computes once within the TTL (memory)", async () => {
    let now = 1_000_000;
    const cache = createTtlCache({ redis: null, now: () => now });
    const compute = vi.fn(async () => ({ value, cacheable: true }));

    expect(await cache.get("k", 60_000, compute)).toEqual(value);
    now += 59_999;
    expect(await cache.get("k", 60_000, compute)).toEqual(value);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("recomputes after the TTL expires", async () => {
    let now = 1_000_000;
    const cache = createTtlCache({ redis: null, now: () => now });
    const compute = vi.fn(async () => ({ value, cacheable: true }));

    await cache.get("k", 60_000, compute);
    now += 60_000;
    await cache.get("k", 60_000, compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("uses Redis get/set with a prefixed key and EX in seconds", async () => {
    const redis = fakeRedis();
    const cache = createTtlCache({ redis, prefix: "analytics:" });
    const compute = vi.fn(async () => ({ value, cacheable: true }));

    await cache.get("org:2026-09-01:2026-09-07", 600_000, compute);
    expect(redis.set).toHaveBeenCalledWith("analytics:org:2026-09-01:2026-09-07", value, { ex: 600 });

    // A different instance (empty memory) is served from Redis.
    const other = createTtlCache({ redis, prefix: "analytics:" });
    expect(await other.get("org:2026-09-01:2026-09-07", 600_000, compute)).toEqual(value);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("falls back to memory when Redis errors", async () => {
    const redis = {
      get: vi.fn(async () => { throw new Error("down"); }),
      set: vi.fn(async () => { throw new Error("down"); }),
    };
    const cache = createTtlCache({ redis });
    const compute = vi.fn(async () => ({ value, cacheable: true }));

    await cache.get("k", 60_000, compute);
    expect(await cache.get("k", 60_000, compute)).toEqual(value);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("does not store non-cacheable results", async () => {
    const redis = fakeRedis();
    const cache = createTtlCache({ redis });
    const compute = vi.fn(async () => ({ value, cacheable: false }));

    expect(await cache.get("k", 60_000, compute)).toEqual(value);
    expect(await cache.get("k", 60_000, compute)).toEqual(value);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("does not store anything when compute throws", async () => {
    const cache = createTtlCache({ redis: null });
    const failing = vi.fn(async () => { throw new Error("boom"); });
    await expect(cache.get("k", 60_000, failing)).rejects.toThrow("boom");

    const compute = vi.fn(async () => ({ value, cacheable: true }));
    await cache.get("k", 60_000, compute);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("caps the in-memory map size", async () => {
    const cache = createTtlCache({ redis: null, maxEntries: 2 });
    const compute = vi.fn(async () => ({ value, cacheable: true }));

    await cache.get("a", 60_000, compute);
    await cache.get("b", 60_000, compute);
    await cache.get("c", 60_000, compute);
    expect(cache.size()).toBe(2);
    // Oldest entry was evicted.
    await cache.get("a", 60_000, compute);
    expect(compute).toHaveBeenCalledTimes(4);
  });
});
