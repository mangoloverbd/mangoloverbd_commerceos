import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const sidebarSource = readFileSync(resolve(process.cwd(), "src/components/AppSidebar.tsx"), "utf8");

describe("Staff Performance navigation", () => {
  it("registers the protected report route for every authenticated staff member", () => {
    expect(appSource).toContain('const StaffPerformance = lazy(() => import("./pages/StaffPerformance"))');
    expect(appSource).toContain('<Route path="/reports/staff" element={<StaffPerformance />} />');
    expect(appSource).not.toContain('<Route path="/reports/staff" element={<AdminRoute><StaffPerformance /></AdminRoute>} />');
  });

  it("places Staff Performance in its Reports sidebar section", () => {
   expect(sidebarSource).toContain('label: "Reports"');
    expect(sidebarSource).toMatch(/const reports: NavSection = \{[\s\S]*?label: "Reports",[\s\S]*?collapsible: true/);
    expect(sidebarSource).toContain('id: "staff-performance"');
    expect(sidebarSource).toContain('title: "Staff Performance"');
    expect(sidebarSource).toContain('link: "/reports/staff"');
  });
});
