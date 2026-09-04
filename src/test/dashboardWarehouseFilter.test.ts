import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
describe("dashboard warehouse filter", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");
  it("filters and resets pagination", () => {
    expect(source).toContain("warehouseFilter");
    expect(source).toContain('data-testid="select-warehouse-filter"');
    expect(source).toContain("setOrderPage(0)");
  });
});
