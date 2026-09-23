import { describe, expect, it } from "vitest";
import locations from "../../server/risk/dictionaries/bdLocations.json";
import { parseBdLocation } from "../../server/risk/location.js";
import { classifyContent } from "../../server/risk/content.js";
import { MOBILE_ASNS, classifyNetwork, lookupAsn } from "../../server/risk/network.js";

describe("pinned BD risk reference data", () => {
  it("contains 8 divisions, 64 districts and 494 upazilas", () => {
    expect(locations.divisions).toHaveLength(8);
    expect(locations.districts).toHaveLength(64);
    expect(locations.upazilas).toHaveLength(494);
    expect(["15", "16", "18", "19"].map(id => locations.districts.find(d => d.id === id)?.name))
      .toEqual(["Rajshahi", "Natore", "Chapainawabganj", "Naogaon"]);
  });

  it("does not infer a hater district from ambiguous upazila alone", () => {
    for (const place of ["Durgapur", "Shibganj", "Nawabganj"]) {
      expect(parseBdLocation(`House 1 Road 2 ${place}`).districtId).toBeNull();
    }
    expect(parseBdLocation("House 1 Road 2 Rajshahi")).toMatchObject({ districtId: "15", hasPlaceMarker: true, hasArea: true });
    expect(parseBdLocation("বাড়ি ১ রোড ২ নাটোর").districtId).toBe("16");
    expect(parseBdLocation("House 1 Road 2 Dhanmondi").districtName).toBe("Dhaka");
  });

  it("matches obfuscated abuse and test content without broad place-name matches", () => {
    expect(classifyContent({ name: "Test", address: "House 1 Road 2 Dhaka", notes: "" })).toContain("test_content");
    expect(classifyContent({ name: "Rahim", address: "House 1 Road 2 Dhaka", notes: "f.u.c.k" })).toContain("abusive_content");
    expect(classifyContent({ name: "Rahim", address: "House 1 Road 2 Dhaka", notes: "" })).toEqual([]);
  });

  it("classifies mobile, broadband, foreign, unknown and mapped IPv4", () => {
    expect(MOBILE_ASNS).toEqual([24389, 24432, 45245, 45925]);
    expect(lookupAsn("103.12.44.7")).toEqual(expect.any(Number));
    expect(classifyNetwork({ ip: "8.8.8.8", country: "US" })).toMatchObject({ type: "foreign" });
    expect(classifyNetwork({ ip: "invalid", country: null })).toEqual({ type: "unknown", asn: null });
  });
});
