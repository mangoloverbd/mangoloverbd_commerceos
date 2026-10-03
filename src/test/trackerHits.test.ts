import { describe, expect, it } from "vitest";
import { normalizeTrackerKind, shouldForwardTrackerHit } from "../../server/trackerHits.js";

describe("tracker hit forwarding", () => {
  it("never forwards 20-second heartbeats", () => {
    expect(shouldForwardTrackerHit("heartbeat")).toBe(false);
  });
  it("forwards page views and explicit steps", () => {
    expect(shouldForwardTrackerHit("pageview")).toBe(true);
    expect(shouldForwardTrackerHit("step")).toBe(true);
  });
  it("forwards legacy pings without a kind so open tabs on the old script still count", () => {
    expect(shouldForwardTrackerHit(undefined)).toBe(true);
    expect(shouldForwardTrackerHit(null)).toBe(true);
  });
  it("treats unknown kinds as legacy rather than trusting arbitrary input", () => {
    expect(normalizeTrackerKind("HEARTBEAT")).toBeNull();
    expect(normalizeTrackerKind({})).toBeNull();
    expect(shouldForwardTrackerHit("something-else")).toBe(true);
  });
});
