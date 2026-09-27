import { describe, expect, it } from "vitest";
import { customerOrderedInRange } from "@/lib/customerDateFilter";

const customer = {
  timeline: [
    { createdAt: "2026-09-20T20:00:00.000Z" }, // Sep 21 in Dhaka
    { createdAt: "2026-09-10T06:00:00.000Z" },
  ],
};

describe("customerOrderedInRange", () => {
  it("keeps every customer when no range is selected", () => {
    expect(customerOrderedInRange(customer, null)).toBe(true);
  });

  it("matches when any order falls inside the range by Dhaka calendar day", () => {
    expect(customerOrderedInRange(customer, { from: new Date(2026, 8, 21), to: new Date(2026, 8, 21) })).toBe(true);
    expect(customerOrderedInRange(customer, { from: new Date(2026, 8, 5), to: new Date(2026, 8, 12) })).toBe(true);
  });

  it("excludes customers with no order inside the range", () => {
    expect(customerOrderedInRange(customer, { from: new Date(2026, 8, 11), to: new Date(2026, 8, 20) })).toBe(false);
    expect(customerOrderedInRange({ timeline: [{ createdAt: null }] }, { from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) })).toBe(false);
  });

  it("treats a single-day selection without an end date as that day", () => {
    expect(customerOrderedInRange(customer, { from: new Date(2026, 8, 10), to: undefined })).toBe(true);
  });
});
