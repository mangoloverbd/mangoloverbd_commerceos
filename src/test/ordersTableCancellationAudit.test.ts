import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/OrdersTable.tsx"), "utf8");

describe("OrdersTable cancellation audit", () => {
  it("requires a structured reason before sending a cancelled status", () => {
    expect(source).toContain("CANCELLATION_REASON_OPTIONS");
    expect(source).toContain("cancellation_reason_code");
    expect(source).toContain("cancellation_reason_note");
    expect(source).toContain("Confirm cancellation");
    expect(source).toMatch(/newStatus === "cancelled"[\s\S]*setCancellationTarget/);
  });
});
