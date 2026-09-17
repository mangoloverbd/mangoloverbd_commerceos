import { describe, expect, it } from "vitest";
import { BD_DISTRICTS, detectDistrict } from "@/lib/bdDistricts";

describe("detectDistrict", () => {
  it("matches English and Bengali district names", () => {
    expect(detectDistrict("House 12, Road 5, Dhanmondi, Dhaka")).toBe("Dhaka");
    expect(detectDistrict("বাসা ৩, গাজীপুর")).toBe("Gazipur");
    expect(detectDistrict("Chittagong GEC Circle")).toBe("Chattogram");
  });

  it("maps areas to districts even when the district is not written", () => {
    expect(detectDistrict("House 7, Dhanmondi")).toBe("Dhaka");
    expect(detectDistrict("Tongi, Station Road")).toBe("Gazipur");
  });

  it("prefers learned aliases and returns null when unknown", () => {
    expect(detectDistrict("Somewhere New", { "somewhere new": "Sylhet" })).toBe("Sylhet");
    expect(detectDistrict("Somewhere New", { "somewhere new": null })).toBe(null);
    expect(detectDistrict("")).toBe(null);
    expect(detectDistrict(null)).toBe(null);
  });

  it("covers all 64 districts", () => {
    expect(BD_DISTRICTS).toHaveLength(64);
  });
});
