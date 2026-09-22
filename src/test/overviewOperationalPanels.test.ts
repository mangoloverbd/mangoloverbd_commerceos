import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Overview operational panels", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Overview.tsx"), "utf8");

  it("uses Staff Performance instead of Inbox Activity", () => {
    expect(source).toContain('import { StaffPerformancePanel } from "@/components/overview/StaffPerformancePanel";');
    expect(source).toContain("<StaffPerformancePanel data={data.staffPerformance} />");
    expect(source).not.toContain('import { SocialInboxPanel } from "@/components/overview/SocialInboxPanel";');
    expect(source).not.toContain("<SocialInboxPanel data={data.socialInbox} />");
  });

  it("uses Pending Fulfillment instead of Unread Messages", () => {
    expect(source).toContain('label="Pending Fulfillment"');
    expect(source).toContain('icon="Warning"');
    expect(source).not.toContain('label="Unread Messages"');
  });
});
