import { describe, expect, it } from "vitest";
import { buildRiskContext } from "../../server/risk/context.js";

const orgId = "20000000-0000-0000-0000-000000000001";
const secret = "risk-secret-with-more-than-sixteen-characters";
const clientContext = {
  ip: "103.12.44.7", userAgent: "Browser Agent", geo: { country: "BD", region: "BD-C", city: "Dhaka" },
  deviceId: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e", fingerprint: "a".repeat(64),
  telemetry: { firstInteractionAt: "2026-09-23T12:00:00.000Z", phoneCandidates: ["01712345678", "01812345678"], pastedFields: ["phone"] },
};
const body = { customer_name: "Rahim", phone: "+8801712345678", address: "House 1 Road 2 Dhaka", notes: "", items: [{ productId: "p", variantId: "v", quantity: 1 }], website: "" };

describe("risk context", () => {
  it("normalizes phone and hashes all trusted identifiers", () => {
    const ctx = buildRiskContext({ orgId, route: "public_v1", body, clientContext, contextTrusted: true, secret, now: Date.parse("2026-09-23T12:00:15Z"), turnstile: "ok" });
    expect(ctx.customer.phone).toBe("01712345678");
    expect(ctx.ip).toBe(clientContext.ip);
    expect(ctx.networkKey).toBe("v4:103.12.44.0/24");
    expect(ctx.telemetry.phoneCandidates).toHaveLength(2);
    expect(Object.values(ctx.hashes).filter(Boolean)).toEqual(expect.arrayContaining([expect.stringMatching(/^[0-9a-f]{64}$/)]));
    expect(JSON.stringify(ctx.hashes)).not.toContain("01712345678");
    expect(JSON.stringify(ctx.hashes)).not.toContain("103.12.44.7");
  });

  it("drops browser-provided context when not signed", () => {
    const ctx = buildRiskContext({ orgId, route: "custom_webhook", body: { ...body, deviceId: clientContext.deviceId, ip: clientContext.ip, fingerprint: clientContext.fingerprint }, clientContext, contextTrusted: false, secret });
    expect(ctx).toMatchObject({ ip: null, networkKey: null, deviceId: null, fingerprint: null, contextTrusted: false });
    expect(ctx.hashes.device).toBeNull();
    expect(ctx.telemetry.phoneCandidates).toEqual([]);
  });

  it("rejects invalid phone and missing secret, but tolerates unusual item shapes for the order route to validate", () => {
    const options = { orgId, route: "public_v1", body, clientContext, contextTrusted: true, secret };
    expect(() => buildRiskContext({ ...options, body: { ...body, phone: "invalid" } })).toThrow();
    expect(buildRiskContext({ ...options, body: { ...body, items: [{ quantity: -1 }] } }).items).toEqual([{ productId: null, variantId: null, quantity: 1 }]);
    expect(() => buildRiskContext({ ...options, secret: "short" })).toThrow();
  });
});
