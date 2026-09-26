import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function route(startMarker: string, endMarker: string) {
  const start = server.indexOf(startMarker);
  const end = server.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return server.slice(start, end);
}

describe("order approval customer details route guards", () => {
  it("checks customer details when an existing order enters Approved", () => {
    const patch = route('app.patch("/api/orders/:id"', 'app.post("/api/orders/:id/send-sms"');

    expect(server).toContain('from "./orderApprovalDetails.js"');
    expect(patch).toContain("isApprovedStatus(update.status)");
    expect(patch).toContain("!isApprovedStatus(orderCheck.status)");
    expect(patch).toContain("getOrderApprovalDetailsError({ ...orderCheck, ...update })");
    expect(patch).toContain('return res.status(400).json(approvalError);');
  });

  it("checks customer details when a manual order is created as Approved", () => {
    const create = route('app.post("/api/orders"', 'app.patch("/api/orders/:id"');

    expect(create).toContain("isApprovedStatus(row.status)");
    expect(create).toContain("getOrderApprovalDetailsError({");
    expect(create).toContain('phone: typeof req.body?.phone === "string" ? req.body.phone : ""');
    expect(create).toContain('return res.status(400).json(approvalError);');
  });

  it("checks effective customer details before converting an abandoned checkout as Approved", () => {
    const convert = route(
      'app.post("/api/abandoned-checkouts/:id/convert"',
      'app.get("/api/orders/recent-notifications"',
    );

    expect(convert).toContain('if (status === "approved")');
    expect(convert).toContain("getOrderApprovalDetailsError({ customer_name: customerName, phone: draft.phone, address })");
    expect(convert).toContain('return res.status(400).json(approvalError);');
    expect(convert.indexOf("getOrderApprovalDetailsError")).toBeLessThan(convert.indexOf("resolveAbandonedCatalogIds"));
  });
});
