import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

test("both ingress paths verify context before limiting and hash only signed devices", () => {
  const custom = source.slice(source.indexOf('app.post("/api/custom-orders/webhook"'), source.indexOf("// ─── Live Visitor Tracking"));
  const publicRoute = source.slice(source.indexOf("async function handlePublicHandleOrderSubmit"), source.indexOf("async function handlePublicHandleProducts"));
  for (const section of [custom, publicRoute]) {
    expect(section).toContain("verifyClientContext(req.headers[CLIENT_CONTEXT_HEADER]");
    expect(section.indexOf("verifyClientContext(")).toBeLessThan(section.indexOf("await allowOrderSubmission("));
    expect(section).toContain("clientContext = verified.ok ? verified.context : null");
  }
  const limiter = source.slice(source.indexOf("async function allowOrderSubmission"), source.indexOf("const PRODUCT_IMAGES_BUCKET"));
  expect(limiter).toContain("[[rlOrderDevice, `dev:");
  expect(limiter).not.toContain("rlOrderNetwork");
  expect(limiter).not.toContain("rlOrderUntrustedIp");
  expect(limiter).toContain("await limiter.limit(");
  expect(limiter).not.toContain("res.status(503)");
  expect(limiter).not.toContain("res.status(429)");
});
