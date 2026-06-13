import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("sidebar active item style", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/nav-main.tsx"), "utf8");

  it("uses the P&L card treatment for selected navigation items", () => {
    expect(source).toContain("activeNavItemClass");
    expect(source).toContain("bg-[#FFFFFF]");
    expect(source).toContain("!rounded-lg");
    expect(source).toContain("border-[1.5px] border-black/[0.16]");
    expect(source).toContain("shadow-[0_2px_6px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.7)]");
  });
});
