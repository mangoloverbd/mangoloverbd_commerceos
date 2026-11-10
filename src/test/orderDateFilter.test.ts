import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { filterOrdersByDateRange, DATE_FILTER_TABS, orderDateFieldFor, orderDateRangeBounds } from "@/lib/orderDateFilter";

const order = (id: string, created_at: string | null) => ({ id, created_at });

describe("filterOrdersByDateRange", () => {
  const orders = [
    order("before", new Date(2026, 8, 22, 23, 59).toISOString()),
    order("a", new Date(2026, 8, 23, 0, 5).toISOString()),
    order("b", new Date(2026, 8, 24, 23, 55).toISOString()),
    order("after", new Date(2026, 8, 25, 0, 1).toISOString()),
    order("missing", null),
  ];

  it("keeps orders whose local order date is inside the inclusive range", () => {
    const range = { from: new Date(2026, 8, 23), to: new Date(2026, 8, 24) };
    expect(filterOrdersByDateRange(orders, range).map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("treats a single-day range as that whole day", () => {
    expect(filterOrdersByDateRange(orders, { from: new Date(2026, 8, 24), to: new Date(2026, 8, 24) }).map((row) => row.id)).toEqual(["b"]);
    expect(filterOrdersByDateRange(orders, { from: new Date(2026, 8, 24) }).map((row) => row.id)).toEqual(["b"]);
  });

  it("returns everything when no range is set", () => {
    expect(filterOrdersByDateRange(orders, null)).toBe(orders);
  });

  it("is offered on the Processing and Delivered tabs", () => {
    expect(DATE_FILTER_TABS).toEqual(["processing", "delivered"]);
    const dashboard = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");
    expect(dashboard).toContain("DATE_FILTER_TABS.includes(activeOrderStatusFilter)");
    expect(dashboard).toContain("filterOrdersByDateRange(");
    expect(dashboard).toContain('data-testid="orders-date-filter"');
  });

  it("counts the date-filtered orders and keeps the one-row header without an extra All dates box", () => {
    const dashboard = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");
    // Header count reflects the date filter (and the filters after it), not the whole tab.
    expect(dashboard).toContain("const queueCount = isAbandonedQueue ? filteredAbandonedCheckouts.length : printFilteredOrders.length;");
    // Clearing goes through the picker's own "All Time" preset.
    expect(dashboard).not.toContain("All dates");
    expect(dashboard).toContain("lg:flex-row lg:items-center lg:justify-between");
  });
});

describe("orderDateFieldFor", () => {
  it("filters Processing by the day the order moved to Processing and Delivered by the order date", () => {
    expect(orderDateFieldFor("processing")).toBe("processing_at");
    expect(orderDateFieldFor("delivered")).toBe("created_at");
  });

  it("filters by the given date field", () => {
    const rows = [
      { id: "placed-earlier-processed-today", created_at: new Date(2026, 8, 20, 10).toISOString(), processing_at: new Date(2026, 8, 24, 11).toISOString() },
      { id: "placed-today-processed-today", created_at: new Date(2026, 8, 24, 1).toISOString(), processing_at: new Date(2026, 8, 24, 10).toISOString() },
      { id: "placed-today-not-processed", created_at: new Date(2026, 8, 24, 2).toISOString(), processing_at: null },
    ];
    const today = { from: new Date(2026, 8, 24) };
    expect(filterOrdersByDateRange(rows, today, "processing_at").map((row) => row.id)).toEqual([
      "placed-earlier-processed-today",
      "placed-today-processed-today",
    ]);
    expect(filterOrdersByDateRange(rows, today).map((row) => row.id)).toEqual([
      "placed-today-processed-today",
      "placed-today-not-processed",
    ]);
  });
});

describe("orderDateRangeBounds", () => {
  it("turns an inclusive local-day range into an ISO [from, to) window", () => {
    expect(orderDateRangeBounds({ from: new Date(2026, 8, 1, 15), to: new Date(2026, 8, 15) })).toEqual({
      from: new Date(2026, 8, 1).toISOString(),
      to: new Date(2026, 8, 16).toISOString(),
    });
    expect(orderDateRangeBounds({ from: new Date(2026, 8, 24) })).toEqual({
      from: new Date(2026, 8, 24).toISOString(),
      to: new Date(2026, 8, 25).toISOString(),
    });
    expect(orderDateRangeBounds(null)).toBeNull();
  });
});
