import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const custom = source.slice(source.indexOf('app.post("/api/custom-orders/webhook"'), source.indexOf("// ─── Live Visitor Tracking"));
const publicOrder = source.slice(source.indexOf("async function handlePublicHandleOrderSubmit"), source.indexOf("async function handlePublicHandleProducts"));

describe("v2 order route wiring", () => {
  it("uses the same risk pipeline before both order insertions and links successful orders", () => {
    for (const route of [custom, publicOrder]) {
      expect(route).toContain("await assessOrderRisk({");
      expect(route).toContain("await finalizeOrderRisk({");
      expect(route.indexOf("await assessOrderRisk({")).toBeLessThan(route.indexOf('.from("orders")\n      .insert('));
      expect(route).toContain("protection.enforced && protection.decision === \"HOLD\"");
      expect(route).toContain("protection.enforced && protection.decision === \"BLOCK\"");
    }
    expect(source).toContain('from "./risk/pipeline.js"');
  });

  it("asks held customers to retry when no review row exists, instead of letting them through", () => {
    expect(publicOrder).toContain("if (!protection.reviewId) {");
    expect(publicOrder).toContain('error: "protection_unavailable"');
    expect(publicOrder).toContain("retryable: true");
  });

  it("does not apply a shared network or unsigned-IP rate limit on mobile/unknown context", () => {
    const limiter = source.slice(source.indexOf("async function allowOrderSubmission"), source.indexOf("const PRODUCT_IMAGES_BUCKET"));
    expect(limiter).toContain('clientContext?.deviceId');
    expect(limiter).not.toContain('rlOrderNetwork');
    expect(limiter).not.toContain("rlOrderUntrustedIp.limit(");
    expect(limiter).not.toContain("getTrustedRequestIp(req) || \"unknown\"");
  });
});
