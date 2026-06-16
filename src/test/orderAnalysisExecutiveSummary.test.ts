import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("OrderAnalysis executive summary visuals", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/OrderAnalysis.tsx"), "utf8");

  it("renders the approved Product Mix summary instead of a plain markdown-only block", () => {
    expect(source).toContain("ExecutiveProductMix");
    expect(source).toContain("Product Mix");
    expect(source).toContain("Revenue Mix");
    expect(source).toContain("Top Product Velocity");
    expect(source).toContain("AI Readout");
  });

  it("uses a vertical stacked Product Mix layout with full-width cards", () => {
    expect(source).toContain("space-y-4");
    expect(source).not.toContain("lg:grid-cols-[minmax");
    expect(source).not.toContain("h-36 items-end");
    expect(source).not.toContain("lg:grid-cols-[380px_1fr]");
    expect([...source.matchAll(/rounded-2xl/g)].length).toBeGreaterThanOrEqual(3);
  });
});
