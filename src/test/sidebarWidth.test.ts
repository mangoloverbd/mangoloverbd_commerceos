import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("sidebar width", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/ui/sidebar.tsx"), "utf8");

  it("uses the redesigned 248px sidebar and 64px rail, leaving the mobile sheet unchanged", () => {
    expect(source).toContain('const SIDEBAR_WIDTH = "248px";');
    expect(source).toContain('const SIDEBAR_WIDTH_MOBILE = "192px";');
    expect(source).toContain('const SIDEBAR_WIDTH_ICON = "4rem";');
  });
});
