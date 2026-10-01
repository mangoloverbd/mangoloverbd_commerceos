import { describe, expect, it } from "vitest";
import {
  NO_REASON,
  buildCancelledOrdersCsv,
  cancellationReasonKey,
  countCancellationReasons,
  filterCancelledByDate,
  filterCancelledByReasons,
  presetRange,
  summarizeCancellations,
  uniqueCancelledPhones,
  type CancelledOrder,
} from "@/lib/cancellationInsights";

const NOW = new Date(2026, 9, 1, 15, 0);
const at = (daysAgo: number, hour = 12) => new Date(2026, 9, 1 - daysAgo, hour).toISOString();

const order = (overrides: Partial<CancelledOrder> & { id: string }): CancelledOrder => ({
  created_at: at(0),
  cancelled_at: at(0),
  phone: "01712345678",
  price: 1000,
  delivery_rate: 100,
  ...overrides,
});

describe("cancellation insights", () => {
  it("maps missing and unknown reason codes", () => {
    expect(cancellationReasonKey(order({ id: "a", cancellation_reason_code: "out_of_stock" }))).toBe("out_of_stock");
    expect(cancellationReasonKey(order({ id: "b", cancellation_reason_code: null }))).toBe(NO_REASON);
    expect(cancellationReasonKey(order({ id: "c", cancellation_reason_code: "retired_code" }))).toBe("other");
  });

  it("filters by cancelled date, falling back to the order date", () => {
    const orders = [
      order({ id: "today", cancelled_at: at(0), created_at: at(3) }),
      order({ id: "old", cancelled_at: at(10), created_at: at(10) }),
      order({ id: "legacy", cancelled_at: null, created_at: at(2) }),
    ];
    const week = presetRange("7d", NOW);
    expect(filterCancelledByDate(orders, week, "cancelled").map((o) => o.id)).toEqual(["today", "legacy"]);
    expect(filterCancelledByDate(orders, presetRange("today", NOW), "ordered").map((o) => o.id)).toEqual([]);
    expect(filterCancelledByDate(orders, presetRange("all", NOW), "cancelled")).toHaveLength(3);
  });

  it("ranks reasons and keeps No reason recorded last", () => {
    const orders = [
      order({ id: "1", cancellation_reason_code: null }),
      order({ id: "2", cancellation_reason_code: null }),
      order({ id: "3", cancellation_reason_code: "customer_unreachable" }),
      order({ id: "4", cancellation_reason_code: "customer_unreachable" }),
      order({ id: "5", cancellation_reason_code: "pricing_issue" }),
    ];
    expect(countCancellationReasons(orders).map((r) => [r.key, r.count])).toEqual([
      ["customer_unreachable", 2], ["pricing_issue", 1], [NO_REASON, 2],
    ]);
    expect(filterCancelledByReasons(orders, new Set(["pricing_issue", NO_REASON] as const)).map((o) => o.id)).toEqual(["1", "2", "5"]);
  });

  it("dedupes phones across formats and counts repeat cancellers", () => {
    const all = [
      order({ id: "1", phone: "+8801712345678" }),
      order({ id: "2", phone: "01712-345678" }),
      order({ id: "3", phone: "01811111111", price: 500, delivery_rate: 0, advanced_payment: 200 }),
      order({ id: "4", phone: null }),
    ];
    expect(uniqueCancelledPhones(all)).toEqual(["01712345678", "01811111111"]);
    expect(summarizeCancellations(all.slice(1), all)).toEqual({ orders: 3, customers: 2, value: 1100 + 300 + 1100, repeatCustomers: 1 });
  });

  it("builds an Excel-safe CSV", () => {
    const csv = buildCancelledOrdersCsv([
      order({ id: "1", order_number: "#1001", customer_name: "রহিমা", cancellation_reason_code: "other", cancellation_reason_note: '=HYPERLINK("x"), said "no"' }),
    ]);
    expect(csv.startsWith("\uFEFFOrder,Customer,Phone,Reason,Note")).toBe(true);
    expect(csv).toContain("#1001,রহিমা,01712345678,Other,");
    expect(csv).toContain(`"'=HYPERLINK(""x""), said ""no"""`);
  });
});
