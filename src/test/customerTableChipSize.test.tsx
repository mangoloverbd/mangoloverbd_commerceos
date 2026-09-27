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
  sources: ["custom_website"],
  primarySource: "custom_website",
  riskLevel: "low",
  segments: [],
  lifecycleStage: "repeat",
  campaignSegments: [],
  lastOrderAt: null,
  timeline: [],
};

describe("CustomerDataTable chips", () => {
  it("renders source, lifecycle and risk chips at one shared size", () => {
    render(<CustomerDataTable customers={[customer]} loading={false} onSelect={vi.fn()} />);
    for (const label of ["Custom Website", "Repeat", "low"]) {
      expect(screen.getByText(label)).toHaveClass("w-[128px]", "justify-center");
    }
  });

  it.each([
    ["new", "New", "bg-status-blue-background"],
    ["repeat", "Repeat", "bg-status-green-background"],
  ] as const)("colors the %s lifecycle chip", (lifecycleStage, label, bgClass) => {
    render(<CustomerDataTable customers={[{ ...customer, lifecycleStage }]} loading={false} onSelect={vi.fn()} />);
    expect(screen.getByText(label)).toHaveClass(bgClass);
  });

  it.each([
    ["low", "bg-status-green-background"],
    ["medium", "bg-status-yellow-background"],
    ["high", "bg-status-rose-background"],
  ] as const)("colors the %s risk chip", (riskLevel, bgClass) => {
    render(<CustomerDataTable customers={[{ ...customer, riskLevel }]} loading={false} onSelect={vi.fn()} />);
    expect(screen.getByText(riskLevel)).toHaveClass(bgClass);
  });

  it.each([
    ["facebook", "Facebook", "bg-status-blue-background"],
    ["whatsapp", "WhatsApp", "bg-status-green-background"],
    ["custom_website", "Custom Website", "bg-status-yellow-background"],
    ["instagram", "Instagram", "bg-status-rose-background"],
    ["shopify", "Shopify", "bg-status-cyan-background"],
    ["social_inbox", "Social Inbox", "bg-status-purple-background"],
    ["manual", "Manual", "bg-background-tertiary-default"],
  ] as const)("colors the %s source chip", (primarySource, label, bgClass) => {
    render(<CustomerDataTable customers={[{ ...customer, primarySource }]} loading={false} onSelect={vi.fn()} />);
    expect(screen.getByText(label)).toHaveClass(bgClass);
  });
});
