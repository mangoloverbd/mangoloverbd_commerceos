import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("products COG input layout", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Products.tsx"), "utf8");

  it("keeps the COG input compact while preserving the inline save affordance", () => {
    expect(source).toContain('className="relative flex w-full"');
    expect(source).toContain('className="h-9 w-full rounded-[12px] pl-7 pr-3');
    expect(source).toContain("absolute right-0 top-0");
  });

  it("keeps product table cost and live badge visually compact", () => {
    expect(source).toContain("max-w-[96px]");
    expect(source).toContain("[appearance:textfield]");
    expect(source).toContain("[&::-webkit-inner-spin-button]:appearance-none");
    expect(source).toContain("rounded-[8px] bg-emerald-50");
  });
});
