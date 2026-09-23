import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { recordAbandonedRiskLinks } from "../../server/risk/abandoned.js";

it("links the verified abandoned checkout phone without counting an order attempt", async () => {
  const record = vi.fn();
  const context = { ip: "103.12.44.7", userAgent: "Browser", geo: { country: "BD", city: "Dhaka" }, deviceId: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e", fingerprint: null, telemetry: { phoneCandidates: [], pastedFields: [], firstInteractionAt: null } };
  await recordAbandonedRiskLinks({ orgId: "20000000-0000-0000-0000-000000000001", capture: { phone: "01712345678" }, clientContext: context, secret: "a long enough hash secret", redis: {}, record });
  expect(record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ hashes: expect.objectContaining({ phone: expect.stringMatching(/^[a-f0-9]{64}$/) }) }), { countAttempt: false });
});

it("uses only verified storefront context after capture succeeds", () => {
  const source = readFileSync("server/index.js", "utf8");
  const route = source.slice(source.indexOf('app.post("/api/custom-orders/abandoned-checkouts"'), source.indexOf('app.post("/api/custom-orders/webhook"'));
  expect(route).toContain("verifyClientContext(req.headers[CLIENT_CONTEXT_HEADER]");
  expect(route).toContain("recordAbandonedRiskLinks({ orgId, capture, clientContext:");
});
