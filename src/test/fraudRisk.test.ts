import { describe, expect, it } from "vitest";
import { courierRows, maskPhone, relativeAge, resolveFraudLevel } from "@/lib/fraudRisk";

describe("courierRows", () => {
  it("rewrites the dead logo host to the live one", () => {
    const rows = courierRows({
      courierData: {
        pathao: { name: "Pathao", logo: "https://fraudshieldbd.site/c-logo/pathao-logo.png", total_parcel: 4, success_parcel: 4 },
      },
    });

    expect(rows[0].logo).toBe("https://fraudshield.bd/c-logo/pathao-logo.png");
  });

  it("leaves live-host logos and missing logos alone", () => {
    const rows = courierRows({
      courierData: {
        pathao: { name: "Pathao", logo: "https://fraudshield.bd/c-logo/pathao-logo.png", total_parcel: 4, success_parcel: 4 },
        redx: { name: "Redx", total_parcel: 0, success_parcel: 0 },
      },
    });

    expect(rows[0].logo).toBe("https://fraudshield.bd/c-logo/pathao-logo.png");
    expect(rows[1].logo).toBeNull();
  });

  it("skips the api summary aggregate", () => {
    const rows = courierRows({
      courierData: {
        summary: { name: "Summary", total_parcel: 45, success_parcel: 42 },
        pathao: { name: "Pathao", total_parcel: 4, success_parcel: 4 },
      },
    });

    expect(rows.map((row) => row.key)).toEqual(["pathao"]);
  });
});

describe("resolveFraudLevel", () => {
  it("prefers the api level and falls back to the success rate", () => {
    expect(resolveFraudLevel({ fraudRiskScore: { level: "moderate" } }, { success_rate: 93 })).toBe("caution");
    expect(resolveFraudLevel(null, { success_rate: 93 })).toBe("safe");
    expect(resolveFraudLevel(null, null)).toBe("unknown");
  });
});

describe("maskPhone", () => {
  it("masks the middle digits of an 11-digit number", () => {
    expect(maskPhone("01800000000")).toBe("018****0000");
    expect(maskPhone(null)).toBe("—");
  });
});

describe("relativeAge", () => {
  it("describes recent timestamps in plain words", () => {
    const now = new Date("2026-09-20T12:00:00Z");
    expect(relativeAge(new Date(now.getTime() - 30_000).toISOString(), now)).toBe("just now");
    expect(relativeAge(new Date(now.getTime() - 11 * 60_000).toISOString(), now)).toBe("11m ago");
    expect(relativeAge(null, now)).toBe("—");
  });
});
