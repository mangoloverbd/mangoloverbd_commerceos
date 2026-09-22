import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("sidebar width", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/ui/sidebar.tsx"), "utf8");

  it("uses the slightly wider expanded width without changing the icon width", () => {
    expect(source).toContain('const SIDEBAR_WIDTH = "192px";');
    expect(source).toContain('const SIDEBAR_WIDTH_MOBILE = "192px";');
    expect(source).toContain('const SIDEBAR_WIDTH_ICON = "2.75rem";');
  });
});
