import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const sidebarSource = readFileSync(resolve(process.cwd(), "src/components/AppSidebar.tsx"), "utf8");

describe("Business Report navigation", () => {
  it("lazy-loads the route behind AdminRoute", () => {
    expect(appSource).toContain('const BusinessReport = lazy(() => import("./pages/BusinessReport"))');
    expect(appSource).toContain('<Route path="/reports/business" element={<AdminRoute><BusinessReport /></AdminRoute>} />');
  });

  it("places an admin-only Business Report item in Reports", () => {
    expect(sidebarSource).toMatch(/const reports: NavSection = \{[\s\S]*?label: "Reports"/);
    expect(sidebarSource).toContain('id: "business-report"');
    expect(sidebarSource).toContain('title: "Business Report"');
    expect(sidebarSource).toContain('link: "/reports/business"');
    expect(sidebarSource).toContain("disabled: !isAdmin");
  });
});
