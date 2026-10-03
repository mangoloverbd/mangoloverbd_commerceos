import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("sidebar width", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/ui/sidebar.tsx"), "utf8");

  it("keeps the original 192px sidebar and 44px rail", () => {
    expect(source).toContain('const SIDEBAR_WIDTH = "192px";');
    expect(source).toContain('const SIDEBAR_WIDTH_MOBILE = "192px";');
    expect(source).toContain('const SIDEBAR_WIDTH_ICON = "2.75rem";');
  });
});
