import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Home and Orders routing", () => {
  const appSource = read("src/App.tsx");
  const sidebarSource = read("src/components/AppSidebar.tsx");

  it("serves the new Home at / and the orders dashboard at /orders", () => {
    expect(appSource).toContain('<Route path="/" element={<Home />} />');
    expect(appSource).toContain('<Route path="/orders" element={<Dashboard />} />');
  });

  it("lists Home first and Orders second in the sidebar main menu", () => {
    const home = sidebarSource.indexOf('id: "home"');
    const orders = sidebarSource.indexOf('id: "orders"');
    const overview = sidebarSource.indexOf('id: "overview"');
    expect(home).toBeGreaterThan(-1);
    expect(home).toBeLessThan(orders);
    expect(orders).toBeLessThan(overview);
    expect(sidebarSource).toMatch(/id: "orders",\s+title: "Orders",[\s\S]*?link: "\/orders"/);
  });
});
