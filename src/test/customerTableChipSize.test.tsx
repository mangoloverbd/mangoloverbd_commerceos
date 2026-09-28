import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomerDataTable } from "@/components/CustomerDataTable";
import type { Customer } from "@/pages/Customers";

vi.mock("@/components/MobileCustomerCards", () => ({ MobileCustomerCards: () => null }));

const customer: Customer = {
  id: "c1",
  name: "Ayesha Rahman",
  phone: "01711111111",
  totalOrders: 2,
  totalSpent: 1600,
  averageOrderValue: 800,
  sources: ["website"],
  primarySource: "website",
  riskLevel: "low",
  segments: [],
  lifecycleStage: "repeat",
  campaignSegments: [],
  lastOrderAt: null,
  timeline: [],
};

describe("CustomerDataTable chips", () => {
  it("renders source, lifecycle and risk chips at one shared size", () => {
    render(<CustomerDataTable customers={[customer]} loading={false} selectedIds={new Set()} onSelectedIdsChange={vi.fn()} />);
    for (const label of ["Website", "Repeat", "low"]) {
      expect(screen.getByText(label)).toHaveClass("w-[128px]", "justify-center");
    }
  });

  it.each([
    ["new", "New", "bg-status-blue-background"],
    ["repeat", "Repeat", "bg-status-green-background"],
  ] as const)("colors the %s lifecycle chip", (lifecycleStage, label, bgClass) => {
    render(<CustomerDataTable customers={[{ ...customer, lifecycleStage }]} loading={false} selectedIds={new Set()} onSelectedIdsChange={vi.fn()} />);
    expect(screen.getByText(label)).toHaveClass(bgClass);
  });

  it.each([
    ["low", "bg-status-green-background"],
    ["medium", "bg-status-yellow-background"],
    ["high", "bg-status-rose-background"],
  ] as const)("colors the %s risk chip", (riskLevel, bgClass) => {
    render(<CustomerDataTable customers={[{ ...customer, riskLevel }]} loading={false} selectedIds={new Set()} onSelectedIdsChange={vi.fn()} />);
    expect(screen.getByText(riskLevel)).toHaveClass(bgClass);
  });

  it.each([
    ["facebook", "Facebook", "bg-status-blue-background"],
    ["whatsapp", "WhatsApp", "bg-status-green-background"],
    ["website", "Website", "bg-status-yellow-background"],
    ["instagram", "Instagram", "bg-status-rose-background"],
    ["phone", "Phone", "bg-status-cyan-background"],
    ["telesales", "Telesales", "bg-status-purple-background"],
    ["upsell", "Upsell", "bg-status-lime-background"],
    ["manual_other", "Manual / Other", "bg-background-tertiary-default"],
  ] as const)("colors the %s source chip", (primarySource, label, bgClass) => {
    render(<CustomerDataTable customers={[{ ...customer, primarySource }]} loading={false} selectedIds={new Set()} onSelectedIdsChange={vi.fn()} />);
    expect(screen.getByText(label)).toHaveClass(bgClass);
  });
});

describe("CustomerDataTable order", () => {
  it("lists the most recent customers first by default", () => {
    const customers: Customer[] = [
      { ...customer, id: "old", name: "Aaron Old", lastOrderAt: "2026-05-01T10:00:00.000Z" },
      { ...customer, id: "none", name: "Babu None", lastOrderAt: null },
      { ...customer, id: "new", name: "Zara New", lastOrderAt: "2026-09-28T10:00:00.000Z" },
    ];
    render(<CustomerDataTable customers={customers} loading={false} selectedIds={new Set()} onSelectedIdsChange={vi.fn()} />);
    const names = screen.getAllByText(/Aaron Old|Babu None|Zara New/).map((node) => node.textContent);
    expect(names).toEqual(["Zara New", "Aaron Old", "Babu None"]);
    expect(screen.getByText("Sep 28, 2026")).toBeInTheDocument();
  });
});
