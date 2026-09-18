import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { buildDateRangePresets } from "@/lib/dateRangePresets";

function ymd(date: Date | undefined) {
  return date ? format(date, "yyyy-MM-dd") : null;
}

describe("buildDateRangePresets", () => {
  it("uses a Sunday-start Bangladesh week through the current date", () => {
    const presets = buildDateRangePresets(new Date(2026, 8, 16));
    const thisWeek = presets.find((preset) => preset.label === "This Week");

    expect(ymd(thisWeek?.range?.from)).toBe("2026-09-13");
    expect(ymd(thisWeek?.range?.to)).toBe("2026-09-16");
  });

  it("uses the complete preceding calendar month", () => {
    const presets = buildDateRangePresets(new Date(2026, 2, 15));
    const lastMonth = presets.find((preset) => preset.label === "Last Month");

    expect(ymd(lastMonth?.range?.from)).toBe("2026-02-01");
    expect(ymd(lastMonth?.range?.to)).toBe("2026-02-28");
  });
});
