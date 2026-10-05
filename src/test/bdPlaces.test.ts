import { describe, expect, it } from "vitest";
import { bdPlaceCoordinates, visitorLocation } from "../../server/bdPlaces.js";

describe("Bangladesh place lookup", () => {
  it("finds districts by common and official spellings", () => {
    expect(bdPlaceCoordinates("Dhaka")).toEqual({ latitude: 23.81, longitude: 90.41 });
    expect(bdPlaceCoordinates("Chittagong")).toEqual(bdPlaceCoordinates("Chattogram"));
    expect(bdPlaceCoordinates("Cox's Bazar")).toEqual(bdPlaceCoordinates("coxs bazar"));
    expect(bdPlaceCoordinates("Bogra")).toEqual(bdPlaceCoordinates("Bogura"));
  });

  it("returns null for unknown or empty places", () => {
    expect(bdPlaceCoordinates("Atlantis")).toBeNull();
    expect(bdPlaceCoordinates("")).toBeNull();
    expect(bdPlaceCoordinates(null)).toBeNull();
  });

  it("prefers stored coordinates and falls back to the city only in Bangladesh", () => {
    expect(visitorLocation({ city: "Dhaka", country: "BD", latitude: "23.70000", longitude: "90.30000" }))
      .toMatchObject({ latitude: 23.7, longitude: 90.3 });
    expect(visitorLocation({ city: "Rajshahi", country: "BD", latitude: null, longitude: null }))
      .toMatchObject({ latitude: 24.37, longitude: 88.6 });
    expect(visitorLocation({ city: "Dhaka", country: "US", latitude: null, longitude: null })).toBeNull();
  });
});
