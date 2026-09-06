import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("print status wiring", () => {
  it("wires Print moves and the Send hint in the orders table", () => {
    const ordersTableSource = readFileSync(
      resolve(process.cwd(), "src/components/OrdersTable.tsx"),
      "utf8",
    );

    expect(ordersTableSource).toContain('from "@/lib/orderTransitions"');
    expect(ordersTableSource).toContain("courierSendBlockReason(order.status)");
    expect(ordersTableSource).toContain("Move to Print first");
  });
});
