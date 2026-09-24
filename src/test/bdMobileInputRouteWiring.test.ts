import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const between = (start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const custom = between('app.post("/api/custom-orders/webhook"', "// ─── Live Visitor Tracking");
const publicOrder = between("async function handlePublicHandleOrderSubmit", "async function handlePublicHandleProducts");
const createOrder = between('app.post("/api/orders", async', 'app.patch("/api/orders/:id", async');
const editOrder = between('app.patch("/api/orders/:id", async', 'app.post("/api/orders/:id/send-sms"');

describe("typed phone numbers use the strict Bangladesh mobile rule", () => {
  it("imports the strict checker", () => {
    expect(source).toMatch(/normalizeBdMobileInput,[\s\S]*?\} from "\.\/abandonedCheckouts\.js"/);
  });

  it("validates storefront and webhook orders before risk assessment", () => {
    for (const route of [custom, publicOrder]) {
      expect(route).toContain("normalizeBdMobileInput(");
      expect(route.indexOf("normalizeBdMobileInput(")).toBeLessThan(route.indexOf("await assessOrderRisk({"));
    }
  });

  it("validates staff-created orders before insert", () => {
    expect(createOrder).toContain("normalizeBdMobileInput(req.body?.phone)");
    expect(createOrder.indexOf("normalizeBdMobileInput(")).toBeLessThan(createOrder.indexOf('.from("orders")'));
  });

  it("validates a staff phone edit only when the phone changes", () => {
    expect(editOrder).toContain("update.phone !== orderCheck.phone");
    expect(editOrder).toContain("normalizeBdMobileInput(update.phone)");
  });
});
