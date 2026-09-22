import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("sidebar active item style", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/nav-main.tsx"), "utf8");
  const appSidebarSource = readFileSync(resolve(process.cwd(), "src/components/AppSidebar.tsx"), "utf8");

  it("uses the P&L card treatment for selected navigation items", () => {
    expect(source).toContain("activeNavItemClass");
    expect(source).toContain("rounded-[8px]");
    expect(source).toContain("text-black");
    expect(source).toContain("glass-button");
  });

  it("uses calmer typography for active and inactive navigation labels", () => {
    expect(source).toContain("font-sans");
    expect(source).not.toContain("font-sf-text");
    expect(source).toContain("text-[13px]");
    expect(source).not.toContain("text-[12.5px]");
    expect(source).toContain('const activeNavLabelClass = "font-medium text-black/90"');
    expect(source).toContain('const inactiveNavLabelClass =');
    expect(source).toContain('"font-normal text-black/80 group-hover/nav-link:text-black/85 group-hover/nav-button:text-black/85"');
    expect(source).not.toContain("!font-bold text-black");
  });

  it("places Reports above Intelligence in the sidebar", () => {
    expect(appSidebarSource.indexOf("sections.push(reports)")).toBeLessThan(
      appSidebarSource.indexOf("sections.push(workspace)"),
    );
  });

  it("places Warehouses immediately above Order Protection", () => {
    const productSection = appSidebarSource.slice(
      appSidebarSource.indexOf("const product: NavSection"),
      appSidebarSource.indexOf("const workspace: NavSection"),
    );
    const routeIds = [...productSection.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]);

    expect(routeIds.slice(-2)).toEqual(["warehouses", "order-protection"]);
  });

  it("renders dividers between the requested sidebar sections", () => {
    expect(source).toContain("sectionIndex > 0");
    expect(source).toContain("border-t border-black/[0.08]");
    expect(source).toContain("sectionIndex");
  });

  it("hides the Billing & Plan sidebar item", () => {
    expect(appSidebarSource).not.toContain('title="Billing & Plan"');
    expect(appSidebarSource).not.toContain('to="/billing"');
  });

  it("shortens the staff navigation label", () => {
    expect(appSidebarSource).toContain('title: "Staff"');
    expect(appSidebarSource).not.toContain('title: "Staff Performance"');
  });

  it("keeps System Settings as the only bottom footer control", () => {
    expect(appSidebarSource).toContain('title="System Settings"');
    expect(appSidebarSource).not.toContain("© 2026 Commerce OS");
    expect(appSidebarSource).not.toContain("PopoverTrigger");
    expect(appSidebarSource).not.toContain("Help Center");
  });
});
