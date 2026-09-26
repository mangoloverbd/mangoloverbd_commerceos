import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const patchStart = serverSource.indexOf('app.patch("/api/orders/:id"');
const patchEnd = serverSource.indexOf('app.post("/api/orders/:id/send-sms"', patchStart);
const patchRoute = serverSource.slice(patchStart, patchEnd);
const createStart = serverSource.indexOf('app.post("/api/orders"');
const createEnd = serverSource.indexOf('app.patch("/api/orders/:id"', createStart);
const createRoute = serverSource.slice(createStart, createEnd);

describe("order hold route wiring", () => {
  it("accepts only structured hold fields and validates holds before the org-scoped write", () => {
    expect(patchRoute).toContain('"hold_reason_code"');
    expect(patchRoute).toContain('"hold_reason_detail"');
    expect(patchRoute).toContain('"hold_until_date"');
    expect(patchRoute).toContain("validateOrderHoldDetails");
    expect(patchRoute).toContain("holdValidation.code");
    expect(patchRoute).toContain('typeof holdUntilDate === "string" ? holdUntilDate.trim() || null : null');
    expect(patchRoute.indexOf("validateOrderHoldDetails")).toBeLessThan(patchRoute.indexOf('.from("orders").update(update)'));
    expect(patchRoute).toContain('.eq("org_id", orgId)');
  });

  it("records the hold reason and return date in the status-change activity event", () => {
    expect(patchRoute).toMatch(/reasonCode:\s*[^,\n]*hold_reason_code/);
    expect(patchRoute).toContain("hold_until_date");
    expect(patchRoute).toContain('"order.status_changed"');
    expect(patchRoute).toContain("recordOrderActivity");
  });

  it("validates and persists hold metadata when creating an order On Hold", () => {
    expect(createRoute).toContain('"hold_reason_code"');
    expect(createRoute).toContain('"hold_reason_detail"');
    expect(createRoute).toContain('"hold_until_date"');
    expect(createRoute).toContain("validateOrderHoldDetails");
    const orderInsert = createRoute.indexOf('.from("orders")');
    expect(orderInsert).toBeGreaterThan(0);
    expect(createRoute.indexOf("validateOrderHoldDetails")).toBeLessThan(orderInsert);
    expect(createRoute).toContain("row.hold_reason_code");
    expect(createRoute).toContain("reasonCode: creationHoldActivity?.reasonCode");
    expect(createRoute).toContain("reasonNote: creationHoldActivity?.reasonNote");
    expect(createRoute).toContain("hold_until_date: creationHoldActivity.holdUntilDate");
  });

  it("rejects hold metadata when creating an order in a non-hold status", () => {
    expect(createRoute).toContain("if (holdMetadataTouched && !startsOnHold)");
  });
});
