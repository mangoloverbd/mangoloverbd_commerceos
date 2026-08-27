import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("sidebar active item style", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/nav-main.tsx"), "utf8");

  it("uses the P&L card treatment for selected navigation items", () => {
    expect(source).toContain("activeNavItemClass");
    expect(source).toContain("rounded-[8px]");
    expect(source).toContain("text-[#1a1a1a]");
    expect(source).toContain("glass-button");
  });
});
