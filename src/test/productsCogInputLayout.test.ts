import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("products COG input layout", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Products.tsx"), "utf8");

  it("keeps the COG input width stable when the save button appears", () => {
    expect(source).toContain('className="relative flex w-full"');
    expect(source).toContain('className="h-9 w-full rounded-[12px] pl-7 pr-11');
    expect(source).toContain("absolute right-0 top-0");
  });
});
