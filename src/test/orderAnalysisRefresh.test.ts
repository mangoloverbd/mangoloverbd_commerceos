import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("OrderAnalysis refresh behavior", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/OrderAnalysis.tsx"), "utf8");

  it("keeps the business forecast fresh for five hours before remount refetches", () => {
    expect(source).toContain("const FIVE_HOURS_IN_MS = 5 * 60 * 60 * 1000");
    expect(source).toContain("staleTime: FIVE_HOURS_IN_MS");
  });
});
