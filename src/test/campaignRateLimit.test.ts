import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { CLIENT_CONTEXT_HEADER, signClientContext, verifyClientContext } from "../../server/clientContext.js";
import { getTrustedRequestIp } from "../../server/risk/network.js";

const source = readFileSync("server/index.js", "utf8");
const secret = "test-secret-at-least-thirty-two-characters";
function limiterHarness() {
  const counts = new Map<string, number>();
  const context = createContext({ process: { env: { STOREFRONT_CONTEXT_SECRET: secret } }, console,
    CLIENT_CONTEXT_HEADER, verifyClientContext, getTrustedRequestIp, isWarmRequest: () => false,
    rlPublicRead: { async limit(key: string) {
      const count = (counts.get(key) || 0) + 1; counts.set(key, count);
      return { success: count <= 60, limit: 60, remaining: Math.max(0, 60 - count), reset: Date.now() + 60000 };
    } },
  });
  runInContext(source.slice(source.indexOf("function makeRateLimitMiddleware"), source.indexOf("async function allowAbandonedCheckoutCapture")), context);
  runInContext(source.slice(source.indexOf("const rateLimitPublicRead ="), source.indexOf("function getClientIp")), context);
  const middleware = runInContext("rateLimitPublicRead", context);
  return { counts, async visit(header?: string) {
    let status = 200; let allowed = false;
    const req = { params: { handle: "mangoloverbd" }, headers: {
      "x-vercel-forwarded-for": "192.0.2.1", "x-storefront-client-ip": "198.51.100.99",
      ...(header ? { [CLIENT_CONTEXT_HEADER]: header } : {}),
    }, socket: { remoteAddress: "127.0.0.1" } };
    const res = { setHeader() {}, status(value: number) { status = value; return this; }, json() {} };
    await middleware(req, res, () => { allowed = true; }); return { status, allowed };
  } };
}
function signed(ip: string, issuedAt = new Date().toISOString(), key = secret) {
  return signClientContext({ v: 1, issuedAt, ip, userAgent: "Mozilla/5.0", geo: { country: null, region: null, city: null }, deviceId: null, fingerprint: null,
    telemetry: { firstInteractionAt: null, phoneCandidates: [], pastedFields: [] } }, key);
}
describe("campaign public read throttling", () => {
  it("gives different verified shoppers separate quotas behind one proxy IP", async () => {
    const harness = limiterHarness();
    for (let n = 1; n <= 61; n++) expect(await harness.visit(signed(`203.0.113.${n}`))).toEqual({ status: 200, allowed: true });
    expect(harness.counts.size).toBe(61);
    expect(harness.counts.get("203.0.113.61:mangoloverbd")).toBe(1);
  });
  it("still throttles the same verified shopper after 60 reads", async () => {
    const harness = limiterHarness(); const header = signed("203.0.113.5");
    for (let n = 0; n < 60; n++) expect((await harness.visit(header)).allowed).toBe(true);
    expect(await harness.visit(header)).toEqual({ status: 429, allowed: false });
  });
  it("falls back to transport identity for missing, forged and expired signatures", async () => {
    const harness = limiterHarness();
    for (const header of [undefined, "forged", signed("203.0.113.5", new Date(Date.now() - 120000).toISOString()), signed("203.0.113.5", new Date().toISOString(), "different-secret")]) {
      expect((await harness.visit(header)).allowed).toBe(true);
    }
    expect([...harness.counts]).toEqual([["192.0.2.1:mangoloverbd", 4]]);
  });
});
