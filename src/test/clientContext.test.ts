import { describe, expect, it } from "vitest";
import { CLIENT_CONTEXT_HEADER, signClientContext, verifyClientContext } from "../../server/clientContext.js";

const secret = "test-context-secret-0123456789abcdef";
const context = {
  v: 1, issuedAt: "2026-09-23T10:00:00.000Z", ip: "103.12.44.7",
  userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/128.0 Mobile",
  geo: { country: "BD", region: "C", city: "Dhaka" },
  deviceId: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e", fingerprint: "a".repeat(64),
  telemetry: { firstInteractionAt: "2026-09-23T09:59:20.000Z", phoneCandidates: ["01712345678"], pastedFields: [] },
};
const expected = `${Buffer.from(JSON.stringify(context)).toString("base64url")}.df202c83d99119befb5ec3bcfd3b624e4617105f9d9e831f89990628511ac440`;

describe("signed storefront context", () => {
  it("verifies the cross-repository HMAC vector at its 60-second boundary", () => {
    expect(CLIENT_CONTEXT_HEADER).toBe("x-mlbd-client-context");
    expect(signClientContext(context, secret)).toBe(expected);
    expect(verifyClientContext(expected, { secret, now: Date.parse(context.issuedAt) + 60_000 })).toEqual({ ok: true, context });
    expect(verifyClientContext(expected, { secret, now: Date.parse(context.issuedAt) + 60_001 })).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects tampering, missing secret, spoofed IP and out-of-bounds data", () => {
    const now = Date.parse(context.issuedAt);
    expect(verifyClientContext(undefined, { secret, now }).reason).toBe("missing");
    expect(verifyClientContext(expected, { secret: "short", now }).reason).toBe("unconfigured");
    expect(verifyClientContext(`${expected.slice(0, -1)}1`, { secret, now }).reason).toBe("bad_signature");
    expect(verifyClientContext("bad", { secret, now }).reason).toBe("malformed");
    for (const change of [{ ip: "not-an-ip" }, { deviceId: "bad" }, { fingerprint: "ABC" },
      { userAgent: "a".repeat(401) }, { geo: { ...context.geo, city: "x".repeat(81) } },
      { telemetry: { ...context.telemetry, phoneCandidates: ["01712345678", "01712345678"] } },
      { telemetry: { ...context.telemetry, pastedFields: ["coupon"] } }]) {
      expect(verifyClientContext(signClientContext({ ...context, ...change }, secret), { secret, now }).reason).toBe("invalid");
    }
  });
});
