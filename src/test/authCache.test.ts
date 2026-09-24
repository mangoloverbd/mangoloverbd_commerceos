import { describe, expect, it } from "vitest";
import { AUTH_CACHE_TTL_MS, createAuthCache, jwtExpiryMs } from "../../server/authCache.js";

function b64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function jwt(payload: Record<string, unknown>) {
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.signature`;
}

const START = 1_700_000_000_000;
const userA = { id: "user-a" };
const userB = { id: "user-b" };

describe("jwtExpiryMs", () => {
  it("decodes exp from the payload in milliseconds", () => {
    expect(jwtExpiryMs(jwt({ exp: 1_700_000_100 }))).toBe(1_700_000_100_000);
  });

  it("returns null for malformed tokens or missing exp", () => {
    expect(jwtExpiryMs("not-a-jwt")).toBeNull();
    expect(jwtExpiryMs("a.@@@.c")).toBeNull();
    expect(jwtExpiryMs(jwt({ sub: "x" }))).toBeNull();
  });
});

describe("createAuthCache", () => {
  it("returns a cached user within 30s and expires after", () => {
    let now = START;
    const cache = createAuthCache({ now: () => now });
    const token = jwt({ exp: START / 1000 + 3600 });

    cache.setUser(token, userA.id, { user: userA });
    now += AUTH_CACHE_TTL_MS - 1;
    expect(cache.getUser(token)).toEqual({ user: userA });
    now += 1;
    expect(cache.getUser(token)).toBeUndefined();
    expect(AUTH_CACHE_TTL_MS).toBe(30_000);
  });

  it("caps the token TTL at the JWT exp", () => {
    let now = START;
    const cache = createAuthCache({ now: () => now });
    const token = jwt({ exp: START / 1000 + 5 });

    cache.setUser(token, userA.id, { user: userA });
    now += 4_999;
    expect(cache.getUser(token)).toEqual({ user: userA });
    now += 1;
    expect(cache.getUser(token)).toBeUndefined();
  });

  it("does not cache an already-expired token", () => {
    const cache = createAuthCache({ now: () => START });
    const token = jwt({ exp: START / 1000 - 1 });
    cache.setUser(token, userA.id, { user: userA });
    expect(cache.getUser(token)).toBeUndefined();
  });

  it("does not key by the raw token (hashes it)", () => {
    const cache = createAuthCache({ now: () => START });
    const token = jwt({ exp: START / 1000 + 3600 });
    cache.setUser(token, userA.id, { user: userA });
    expect(cache.getUser(`${token}x`)).toBeUndefined();
  });

  it("caches org lookups for 30s", () => {
    let now = START;
    const cache = createAuthCache({ now: () => now });
    cache.setOrg(userA.id, { orgId: "org-1", role: "admin" });
    expect(cache.getOrg(userA.id)).toEqual({ orgId: "org-1", role: "admin" });
    now += AUTH_CACHE_TTL_MS;
    expect(cache.getOrg(userA.id)).toBeUndefined();
  });

  it("invalidates every token entry and the org entry for one user only", () => {
    const cache = createAuthCache({ now: () => START });
    const exp = START / 1000 + 3600;
    const t1 = jwt({ exp, n: 1 });
    const t2 = jwt({ exp, n: 2 });
    const t3 = jwt({ exp, n: 3 });
    cache.setUser(t1, userA.id, { user: userA });
    cache.setUser(t2, userA.id, { user: userA });
    cache.setUser(t3, userB.id, { user: userB });
    cache.setOrg(userA.id, { orgId: "org-1", role: "team_member" });
    cache.setOrg(userB.id, { orgId: "org-1", role: "admin" });

    cache.invalidateUser(userA.id);

    expect(cache.getUser(t1)).toBeUndefined();
    expect(cache.getUser(t2)).toBeUndefined();
    expect(cache.getOrg(userA.id)).toBeUndefined();
    expect(cache.getUser(t3)).toEqual({ user: userB });
    expect(cache.getOrg(userB.id)).toEqual({ orgId: "org-1", role: "admin" });
  });

  it("caps the number of entries", () => {
    const cache = createAuthCache({ now: () => START, maxEntries: 2 });
    const exp = START / 1000 + 3600;
    const tokens = [1, 2, 3].map((n) => jwt({ exp, n }));
    tokens.forEach((token, i) => cache.setUser(token, `user-${i}`, { user: { id: `user-${i}` } }));
    expect(cache.getUser(tokens[0])).toBeUndefined();
    expect(cache.getUser(tokens[2])).toEqual({ user: { id: "user-2" } });
  });
});
