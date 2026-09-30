import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Customers page routing", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const sidebarSource = readFileSync(resolve(process.cwd(), "src/components/AppSidebar.tsx"), "utf8");

  it("registers a protected Customers route", () => {
    expect(appSource).toContain('const Customers = lazy(() => import("./pages/Customers"))');
    expect(appSource).toContain('<Route path="/customers" element={<Customers />} />');
  });

  it("adds Customers to the main product navigation", () => {
    expect(sidebarSource).toContain('id: "customers"');
    expect(sidebarSource).toContain('title: "Customers"');
    expect(sidebarSource).toContain('link: "/customers"');
  });

  it("loads customers through apiFetch and supports source-aware labels", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/pages/Customers.tsx"), "utf8");

    expect(pageSource).toContain('apiFetch("/api/customers")');
    expect(pageSource).toContain('CustomerDataTable');
    expect(pageSource).not.toContain('AI source-aware profiles');
    expect(pageSource).toContain("ORDER_SOURCE_OPTIONS");
    expect(pageSource).not.toContain("Shopify");
    expect(pageSource).toContain('primarySource');
  });

  it("supports marketing funnel segments, lifecycle labels, and bulk export", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/pages/Customers.tsx"), "utf8");

    expect(pageSource).toContain('import { buildCustomerExportCsv } from "@/lib/customerExport"');
    expect(pageSource).toContain("campaignSegments");
    expect(pageSource).toContain("lifecycleStage");
    expect(pageSource).toContain("campaignFilter");
    expect(pageSource).toContain("exportFilteredCustomers");
    expect(pageSource).toContain("Export Audience");
    expect(pageSource).toContain("Win-back");
    expect(pageSource).toContain("VIP Loyalty");
  });

  it("provides the requested motion tabs primitives", () => {
    const tabsSource = readFileSync(resolve(process.cwd(), "src/components/ui/motion-tabs.tsx"), "utf8");

    expect(tabsSource).toContain('type Variant = "pill" | "underline" | "segment"');
    expect(tabsSource).toContain('export function Tabs(');
    expect(tabsSource).toContain('export function TabsList');
    expect(tabsSource).toContain('export function TabsTrigger');
    expect(tabsSource).toContain('export function TabsContent');
    expect(tabsSource).toContain('layoutRoot');
  });

  it("opens a dedicated customer page and retains checkbox selection without a popup", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/pages/Customers.tsx"), "utf8");

    expect(pageSource).not.toContain("CustomerBloomPopover");
    expect(pageSource).toContain("onSelectedIdsChange={setSelectedIds}");
    expect(pageSource).toContain("onOpenCustomer=");
  });

  it("uses compact dashboard-style summary cards", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/pages/Customers.tsx"), "utf8");

    expect(pageSource).toContain("min-h-[92px]");
    expect(pageSource).toContain("grid gap-3 sm:grid-cols-2 lg:grid-cols-4");
    expect(pageSource).not.toContain("clipPath");
  });
});
