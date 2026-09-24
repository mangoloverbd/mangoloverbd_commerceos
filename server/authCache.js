import crypto from "node:crypto";

// Per-warm-instance cache for auth lookups. Worst-case staleness after a role
// change or soft delete is AUTH_CACHE_TTL_MS on *other* warm instances; the
// instance that performs a user_roles write invalidates its own entries.
export const AUTH_CACHE_TTL_MS = 30_000;

/**
 * Reads `exp` from a JWT payload WITHOUT verifying it. Only used to cap the
 * cache TTL — the token itself is validated by Supabase on every cache miss.
 */
export function jwtExpiryMs(token) {
  try {
    const payload = String(token).split(".")[1];
    if (!payload) return null;
    const exp = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))?.exp;
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function tokenKey(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function createAuthCache({ now = Date.now, maxEntries = 500 } = {}) {
  const tokens = new Map(); // sha256(token) -> { value, userId, expiresAt }
  const orgs = new Map(); // userId -> { value, expiresAt }

  function read(map, key) {
    const entry = map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now()) {
      map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function write(map, key, entry) {
    const current = now();
    for (const [cachedKey, cached] of map) {
      if (cached.expiresAt <= current) map.delete(cachedKey);
    }
    map.delete(key);
    while (map.size >= maxEntries) map.delete(map.keys().next().value);
    map.set(key, entry);
  }

  return {
    getUser(token) {
      return read(tokens, tokenKey(token));
    },
    setUser(token, userId, value) {
      const current = now();
      const exp = jwtExpiryMs(token);
      const expiresAt = Math.min(current + AUTH_CACHE_TTL_MS, exp ?? Infinity);
      if (expiresAt <= current) return;
      write(tokens, tokenKey(token), { value, userId, expiresAt });
    },
    getOrg(userId) {
      return read(orgs, userId);
    },
    setOrg(userId, value) {
      write(orgs, userId, { value, expiresAt: now() + AUTH_CACHE_TTL_MS });
    },
    invalidateUser(userId) {
      orgs.delete(userId);
      for (const [key, entry] of tokens) {
        if (entry.userId === userId) tokens.delete(key);
      }
    },
  };
}
