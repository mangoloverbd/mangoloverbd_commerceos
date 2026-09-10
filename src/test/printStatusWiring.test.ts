import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("print status wiring", () => {
  it("enforces the Print state machine on the server", () => {
    const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

    expect(server).toContain("Only Approved orders can move to Print");
    expect(server).toContain("Print orders can only move to Processing, Approved, On Hold, or Cancelled");
    expect(server).toContain('toStatus === "processing"');
    expect(server).toContain("Move to Print first before sending to courier");
    // Both main-order courier routes gate Approved sends.
    expect(server.match(/Move to Print first before sending to courier/g)?.length).toBeGreaterThanOrEqual(2);
    const bulkRouteStart = server.indexOf('app.post("/api/send-to-courier/bulk"');
    const singleRouteStart = server.indexOf('app.post("/api/send-to-courier"', bulkRouteStart + 1);
    const pathaoRouteStart = server.indexOf('app.post("/api/send-to-pathao"');
    expect(server.slice(bulkRouteStart, singleRouteStart)).toContain('status: "print"');
    expect(server.slice(singleRouteStart, pathaoRouteStart)).toContain('status: "print"');
    expect(server.slice(pathaoRouteStart)).toContain('status: "processing"');
  });

  it("wires Print moves and the Send hint in the orders table", () => {
    const ordersTableSource = readFileSync(
      resolve(process.cwd(), "src/components/OrdersTable.tsx"),
      "utf8",
    );

    expect(ordersTableSource).toContain('from "@/lib/orderTransitions"');
    expect(ordersTableSource).toContain("courierSendBlockReason(order.status)");
    expect(ordersTableSource).toContain("{sendBlockReason}");
    expect(ordersTableSource).toContain('["print", "confirmed", "processing", "on_hold", "cancelled"]');
  });

  it("wires the authenticated Steadfast bulk contract", () => {
    const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

    expect(server).toContain('app.post("/api/send-to-courier/bulk"');
    expect(server).toContain("getUser(getToken(req))");
    expect(server).toContain("rawOrderIds.length > 500");
    expect(server).toContain("orderIds.length > 500");
    expect(server).toContain("/create_order/bulk-order");
    expect(server).toContain("data: JSON.stringify(");
    expect(server).toContain("normalizeBdPhone");
    expect(server).toContain("item_description");
    expect(server).toContain('.in("id", orderIds)');
    expect(server).toContain('.eq("org_id", orgId)');
    expect(server).toContain('sendBulkSms(orgId, "dispatch", updated)');
  });
});
