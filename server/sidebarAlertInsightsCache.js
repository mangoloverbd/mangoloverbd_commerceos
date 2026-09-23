import crypto from "node:crypto";

// Sidebar AI insights are regenerated only when the org's alert set changes,
// or at most every 15 minutes, instead of on every sidebar poll.
export const SIDEBAR_INSIGHTS_TTL_SECONDS = 15 * 60;

export function sidebarInsightsCacheKey(orgId, alerts) {
  const ids = alerts.map((alert) => `${alert.type}:${alert.id}`).sort();
  const hash = crypto.createHash("sha256").update(ids.join(",")).digest("hex").slice(0, 32);
  return `sidebar-insights:${orgId}:${hash}`;
}

/**
 * Returns `(orgId, alerts, compute) => Promise<insights>`. `compute` resolves
 * to `{ value, cacheable }`; non-cacheable values (e.g. the fallback used when
 * OpenAI fails) are returned without being stored. Uses Redis
 * get/set with EX when a client is provided, otherwise (or on Redis errors)
 * an in-process Map with the same TTL.
 */
export function createSidebarInsightsCache({ redis = null, now = Date.now } = {}) {
  const memory = new Map();

  return async function getCachedSidebarInsights(orgId, alerts, compute) {
    const key = sidebarInsightsCacheKey(orgId, alerts);

    if (redis) {
      try {
        const cached = await redis.get(key);
        if (cached) return cached;
      } catch (err) {
        console.warn("[Sidebar Alerts] Redis cache read failed, using memory:", err.message);
      }
    }

    const current = now();
    const entry = memory.get(key);
    if (entry && entry.expiresAt > current) return entry.value;

    const { value, cacheable } = await compute();
    if (!cacheable) return value;

    if (redis) {
      try {
        await redis.set(key, value, { ex: SIDEBAR_INSIGHTS_TTL_SECONDS });
      } catch (err) {
        console.warn("[Sidebar Alerts] Redis cache write failed, using memory:", err.message);
      }
    }
    for (const [cachedKey, cachedEntry] of memory) {
      if (cachedEntry.expiresAt <= current) memory.delete(cachedKey);
    }
    memory.set(key, { value, expiresAt: current + SIDEBAR_INSIGHTS_TTL_SECONDS * 1000 });
    return value;
  };
}
