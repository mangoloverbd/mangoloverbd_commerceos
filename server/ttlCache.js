/**
 * Generic read-through cache. `get(key, ttlMs, compute)` returns a cached
 * value when present, otherwise awaits `compute()`, which resolves to
 * `{ value, cacheable }`. Non-cacheable values (and thrown errors) are never
 * stored. Uses Redis get/set with EX when a client is provided, and always
 * keeps an in-process Map with the same TTL as the fallback for Redis errors.
 */
export function createTtlCache({ redis = null, now = Date.now, prefix = "", maxEntries = 200 } = {}) {
  const memory = new Map();

  function sweep(current) {
    for (const [cachedKey, entry] of memory) {
      if (entry.expiresAt <= current) memory.delete(cachedKey);
    }
  }

  async function get(key, ttlMs, compute) {
    const fullKey = `${prefix}${key}`;

    if (redis) {
      try {
        const cached = await redis.get(fullKey);
        if (cached != null) return cached;
      } catch (err) {
        console.warn("[TtlCache] Redis read failed, using memory:", err.message);
      }
    }

    const current = now();
    const entry = memory.get(fullKey);
    if (entry && entry.expiresAt > current) return entry.value;

    const { value, cacheable } = await compute();
    if (!cacheable) return value;

    if (redis) {
      try {
        await redis.set(fullKey, value, { ex: Math.max(1, Math.ceil(ttlMs / 1000)) });
      } catch (err) {
        console.warn("[TtlCache] Redis write failed, using memory:", err.message);
      }
    }
    sweep(current);
    memory.delete(fullKey);
    while (memory.size >= maxEntries) {
      memory.delete(memory.keys().next().value);
    }
    memory.set(fullKey, { value, expiresAt: current + ttlMs });
    return value;
  }

  return { get, size: () => memory.size };
}
