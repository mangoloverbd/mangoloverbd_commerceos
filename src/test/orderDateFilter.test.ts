import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { filterOrdersByDateRange, DATE_FILTER_TABS, orderDateRangeBounds } from "@/lib/orderDateFilter";

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
    // Header count reflects the date filter, not the whole tab.
    expect(dashboard).toContain('isAbandonedQueue ? filteredAbandonedCheckouts.length : dateFilteredOrders.length} ${isAbandonedQueue ? "checkouts" : "orders"}');
    // Clearing goes through the picker's own "All Time" preset.
    expect(dashboard).not.toContain("All dates");
    expect(dashboard).toContain("lg:flex-row lg:items-center lg:justify-between");
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

describe("date chip inputs", () => {
  it("are wide enough for a full DD/MM/YYYY date", () => {
    const shared = readFileSync(resolve(process.cwd(), "src/components/base/date-picker/shared.tsx"), "utf8");
    expect(shared).not.toContain("w-[88px]");
    expect(shared).toMatch(/w-\[(9[6-9]|1[0-9][0-9])px\][^"]*tabular-nums/);
  });
});
