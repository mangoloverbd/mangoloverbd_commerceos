import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  readPendingOrderQueue,
  readTabOrderQueue,
  savePendingOrderQueue,
  saveTabOrderQueue,
} from "@/lib/pendingOrderQueue";

const dashboard = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");
const orderDetail = readFileSync(resolve(process.cwd(), "src/pages/OrderDetail.tsx"), "utf8");
const ordersTable = readFileSync(
  resolve(process.cwd(), "src/components/OrdersTable.tsx"),
  "utf8",
);

describe("print order queue (TDD RED)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a saved print queue separately from pending", () => {
    saveTabOrderQueue("print", ["print-1", "print-2"]);
    savePendingOrderQueue(["pending-1"]);

    expect(readTabOrderQueue("print")).toEqual(["print-1", "print-2"]);
    expect(readPendingOrderQueue()).toEqual(["pending-1"]);
  });

  it("returns null for a stale print snapshot", () => {
    saveTabOrderQueue("print", ["print-1"]);

    expect(readTabOrderQueue("print", Date.now() + 31 * 60 * 1000)).toBeNull();
  });

  it("dashboard saves the print queue when the print tab is active", () => {
    expect(dashboard).toContain('filterOrdersByStatus(warehouseOrders, "print")');
    expect(dashboard).toMatch(/fulfillmentTab === "print"[\s\S]{0,120}saveTabOrderQueue\("print"/);
  });

  it("order links carry the print tab context", () => {
    expect(ordersTable).toContain('tab === "print"');
    expect(ordersTable).toContain("?fulfillmentTab=${tab}");
  });

  it("order editor navigates within the print queue", () => {
    expect(orderDetail).toContain("readTabOrderQueue");
    expect(orderDetail).toContain("printOrderIds");
    expect(orderDetail).toContain("Previous ${navTab} order");
    expect(orderDetail).toContain("{queueIndex + 1} of {queueIds!.length} {navTab}");
  });
});
