import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/OrdersTable.tsx"), "utf8");

describe("OrdersTable cancellation audit", () => {
  it("requires a structured reason before sending a cancelled status", () => {
    expect(source).toContain("CANCELLATION_DIALOG_REASON_OPTIONS");
    expect(source).toContain("cancellation_reason_code");
    expect(source).toContain("cancellation_reason_note");
    expect(source).toContain("Confirm cancellation");
    expect(source).toMatch(/newStatus === "cancelled"[\s\S]*setCancellationTarget/);
  });

  it("uses the upward shared select while preserving Bengali labels and stable codes", async () => {
    const { CANCELLATION_DIALOG_REASON_OPTIONS } = await import("@/lib/orderActivity");
    expect(source).toContain("BuiSelect");
    expect(source).toContain('popoverPlacement="top"');
    expect(source).toContain("popoverShouldFlip={false}");
    expect(source).toContain("popoverPortalContainer={cancellationDialogContainer");
    expect(CANCELLATION_DIALOG_REASON_OPTIONS).toContainEqual({ value: "zone_change", label: "এলাকা পরিবর্তন" });
    expect(CANCELLATION_DIALOG_REASON_OPTIONS).toContainEqual({ value: "other", label: "অন্যান্য" });
  });
});
