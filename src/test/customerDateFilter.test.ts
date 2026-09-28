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

describe("customerOrderedInRange with a product", () => {
  const buyer = {
    timeline: [
      { createdAt: "2026-09-20T20:00:00.000Z", product: "1x কাটিমন আম | Katimon Mango" },
      { createdAt: "2026-09-10T06:00:00.000Z", product: "হোমমেড কুমড়ো বড়ি | Homemade Pumpkin Bori (১ কেজি) x1, খাঁটি ঘি | Pure Ghee x1" },
      { createdAt: "2026-09-12T06:00:00.000Z" },
    ],
  };

  it("matches when any order line contains the product name, ignoring case", () => {
    expect(customerOrderedInRange(buyer, null, "খাঁটি ঘি | Pure Ghee")).toBe(true);
    expect(customerOrderedInRange(buyer, null, "কাটিমন আম | katimon mango")).toBe(true);
    expect(customerOrderedInRange(buyer, null, "হানি নাট | Honey Nut")).toBe(false);
  });

  it("requires the product and the date to be on the same order", () => {
    const sep21 = { from: new Date(2026, 8, 21), to: new Date(2026, 8, 21) };
    expect(customerOrderedInRange(buyer, sep21, "কাটিমন আম | Katimon Mango")).toBe(true);
    expect(customerOrderedInRange(buyer, sep21, "খাঁটি ঘি | Pure Ghee")).toBe(false);
  });
});
