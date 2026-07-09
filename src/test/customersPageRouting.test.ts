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
    expect(pageSource).toContain('custom_website: "Custom Website"');
    expect(pageSource).toContain('shopify: "Shopify"');
    expect(pageSource).toContain('primarySource');
  });
});
