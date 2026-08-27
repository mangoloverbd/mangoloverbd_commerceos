import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("DashboardLayout breadcrumb header", () => {
  const layoutSource = readFileSync(resolve(process.cwd(), "src/components/DashboardLayout.tsx"), "utf8");
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

  it("renders a two-level breadcrumb instead of a page title", () => {
    expect(layoutSource).toContain('Dashboard');
    expect(layoutSource).toContain('Overview');
    expect(layoutSource).toMatch(/<CaretRight[^>]*weight="light"[^>]*\/>/);
    expect(layoutSource).toContain("CaretRight");
    expect(layoutSource).toContain('aria-current="page"');
    expect(layoutSource).toContain('text-[#8a8a88]');
    expect(layoutSource).toContain('font-semibold text-[#202020]');
    expect(layoutSource).not.toContain("getRouteTitle(location.pathname)");
    expect(layoutSource).not.toContain('font-sf-display text-[20px] font-semibold leading-none tracking-normal');
  });

  it("covers every authenticated route from App.tsx", () => {
    const protectedRoutes = [
      "/",
      "/returns",
      "/products",
      "/customers",
      "/order-chat",
      "/order-analysis",
      "/inbox/facebook",
      "/inbox/instagram",
      "/inbox/whatsapp",
      "/inbox/orders",
      "/studio",
      "/billing",
      "/settings",
    ];

    for (const route of protectedRoutes) {
      expect(appSource).toContain(`path="${route}"`);
    }

    expect(layoutSource).toContain('"/": "Home"');
    expect(layoutSource).toContain('"/returns": "Returns"');
    expect(layoutSource).toContain('"/products": "Products"');
    expect(layoutSource).toContain('"/customers": "Customers"');
    expect(layoutSource).toContain('"/order-chat": "Ask Edith"');
    expect(layoutSource).toContain('"/order-analysis": "AI Analysis"');
    expect(layoutSource).toContain('"/inbox/facebook": "Facebook"');
    expect(layoutSource).toContain('"/inbox/instagram": "Instagram"');
    expect(layoutSource).toContain('"/inbox/whatsapp": "WhatsApp"');
    expect(layoutSource).toContain('"/inbox/orders": "Inbox Orders"');
    expect(layoutSource).toContain('"/studio": "Studio"');
    expect(layoutSource).toContain('"/billing": "Billing"');
    expect(layoutSource).toContain('"/settings": "System Settings"');
  });

  it("preserves the existing right-side header controls", () => {
    expect(layoutSource).toContain("HeaderAlerts");
    expect(layoutSource).toContain('title="Account"');
  });
});
