import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Customers page routing", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const sidebarSource = readFileSync(resolve(process.cwd(), "src/components/AppSidebar.tsx"), "utf8");

  it("registers a protected Customers route", () => {
    expect(appSource).toContain('import Customers from "./pages/Customers"');
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
    expect(pageSource).toContain('/api/customers/ai-insight');
    expect(pageSource).toContain('import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/motion-tabs"');
    expect(pageSource).toContain('<Tabs value={source}');
    expect(pageSource).toContain('<TabsList');
    expect(pageSource).toContain('<TabsTrigger');
    expect(pageSource).not.toContain('AI source-aware profiles');
    expect(pageSource).toContain('custom_website: "Custom Website"');
    expect(pageSource).toContain('shopify: "Shopify"');
    expect(pageSource).toContain('primarySource');
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

  it("opens customer details as a centered bloom popover instead of a right drawer", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/pages/Customers.tsx"), "utf8");

    expect(pageSource).toContain("function CustomerBloomPopover");
    expect(pageSource).toContain("pointerdown");
    expect(pageSource).toContain("Escape");
    expect(pageSource).not.toContain("motion.aside");
    expect(pageSource).not.toContain("inset-y-0 right-0");
  });

  it("uses smooth modal animation and compact dashboard-style summary cards", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/pages/Customers.tsx"), "utf8");

    expect(pageSource).toContain("customerPopoverTransition");
    expect(pageSource).toContain("scale: 0.96");
    expect(pageSource).toContain('filter: "blur(8px)"');
    expect(pageSource).toContain("rounded-2xl bg-[#F3F3F3] p-3 sm:p-4");
    expect(pageSource).toContain("grid gap-3 sm:grid-cols-2 lg:grid-cols-4");
    expect(pageSource).toContain("min-h-[112px]");
    expect(pageSource).not.toContain("clipPath");
  });
});
