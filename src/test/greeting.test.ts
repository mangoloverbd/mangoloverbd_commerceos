import { describe, expect, it } from "vitest";
import { getDhakaGreeting } from "@/lib/greeting";

/** Returns a Date whose Dhaka (UTC+6) wall-clock time equals hour:minute. */
function dhakaTime(hour: number, minute = 0): Date {
  // Date.UTC rolls negative hours back to the previous day automatically.
  return new Date(Date.UTC(2026, 7, 15, hour - 6, minute, 0));
}

describe("getDhakaGreeting", () => {
  it("says Good morning from 04:00 to 11:59 Dhaka time", () => {
    expect(getDhakaGreeting(dhakaTime(4, 0))).toBe("Good morning");
    expect(getDhakaGreeting(dhakaTime(11, 59))).toBe("Good morning");
  });

  it("says Good afternoon from 12:00 to 16:59 Dhaka time", () => {
    expect(getDhakaGreeting(dhakaTime(12, 0))).toBe("Good afternoon");
    expect(getDhakaGreeting(dhakaTime(16, 59))).toBe("Good afternoon");
  });

  it("says Good evening from 17:00 through 03:59 Dhaka time (no Good night)", () => {
    expect(getDhakaGreeting(dhakaTime(17, 0))).toBe("Good evening");
    expect(getDhakaGreeting(dhakaTime(23, 30))).toBe("Good evening");
    expect(getDhakaGreeting(dhakaTime(0, 0))).toBe("Good evening");
    expect(getDhakaGreeting(dhakaTime(3, 59))).toBe("Good evening");
  });
});
