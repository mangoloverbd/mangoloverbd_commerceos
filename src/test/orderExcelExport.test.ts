import { describe, expect, it } from "vitest";
import { ORDER_EXPORT_COLUMNS, buildOrderExportRows, orderExportFileName } from "@/lib/orderExcelExport";

describe("order Excel export", () => {
  const order = { id: "o1", order_number: "#1", customer_name: "নূর", phone: "0171", address: "ঢাকা", product: "Mango", quantity: 2, weight_kg: 10, price: 900, warehouse_id: "w1", consignment_id: 123 };

  it("maps the agreed columns and preserves Bangla", () => {
    expect(ORDER_EXPORT_COLUMNS).toHaveLength(10);
    expect(buildOrderExportRows([order], { w1: "Mango Lover" })[0]).toEqual(["#1", "নূর", "0171", "ঢাকা", "Mango", 2, 10, 900, "Mango Lover", 123]);
  });

  it("uses inbox fields and blanks unknown values", () => {
    const row = buildOrderExportRows([{ id: "i1", contact_name: "রিয়া", items: [{ product: "Mango", quantity: 3 }], weight_kg: null, consignment_id: null }], {}, { inbox: true })[0];
    expect(row[0]).toBe("IO-i1");
    expect(row[1]).toBe("রিয়া");
    expect(row[4]).toBe("Mango x3");
    expect(row[6]).toBe("");
    expect(row[9]).toBe("");
  });

  it("creates filesystem-safe dated names", () => {
    expect(orderExportFileName(new Date("2026-09-04T00:00:00Z"), "Rajshahi / Mango")).toBe("orders-Rajshahi-Mango-2026-09-04.xlsx");
  });
});
