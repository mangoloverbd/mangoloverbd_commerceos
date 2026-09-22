import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const sidebarSource = readFileSync(resolve(process.cwd(), "src/components/AppSidebar.tsx"), "utf8");

describe("Activity Log navigation", () => {
  it("registers the protected report route for every authenticated staff member", () => {
    expect(appSource).toContain('const ActivityLog = lazy(() => import("./pages/ActivityLog"))');
    expect(appSource).toContain('<Route path="/reports/activity" element={<ActivityLog />} />');
    expect(appSource).not.toContain('<Route path="/reports/activity" element={<AdminRoute><ActivityLog /></AdminRoute>} />');
  });

  it("places Activity Log in the Reports sidebar section", () => {
    expect(sidebarSource).toMatch(/const reports: NavSection = \{[\s\S]*?label: "Reports",[\s\S]*?collapsible: true/);
    expect(sidebarSource).toContain('id: "activity-log"');
    expect(sidebarSource).toContain('title: "Activity Log"');
    expect(sidebarSource).toContain('link: "/reports/activity"');
  });
});
