import { describe, expect, it } from "vitest";
import {
  classifyTrafficSource, deviceFromUserAgent, isAnalyticsId, normalizeAnalyticsPath, parseTrackerAnalyticsHit, productSlugFromPath,
} from "../../server/websiteAnalytics.js";

const ids = {
  event_id: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
  visitor_id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  session_id: "9f8e7d6c-5b4a-4c3d-9e2f-1a0b9c8d7e6f",
};
const now = new Date("2026-10-03T08:00:00Z");

describe("website analytics paths", () => {
  it("keeps only the path, never query strings or fragments", () => {
    expect(normalizeAnalyticsPath("https://www.mangolover.com.bd/product/katimon-mango?phone=017&utm_source=fb#x")).toBe("/product/katimon-mango");
    expect(normalizeAnalyticsPath("https://www.mangolover.com.bd/")).toBe("/");
    expect(normalizeAnalyticsPath("https://www.mangolover.com.bd/step/katimon-mango/")).toBe("/step/katimon-mango");
  });
  it("rejects non-web URLs, API paths and oversized paths", () => {
    expect(normalizeAnalyticsPath("javascript:alert(1)")).toBeNull();
    expect(normalizeAnalyticsPath("https://x.com/api/orders")).toBeNull();
    expect(normalizeAnalyticsPath(`https://x.com/${"a".repeat(250)}`)).toBeNull();
    expect(normalizeAnalyticsPath(42)).toBeNull();
  });
  it("recognises product pages in both URL styles", () => {
    expect(productSlugFromPath("/product/katimon-mango")).toBe("katimon-mango");
    expect(productSlugFromPath("/products/Himsagar-Mango")).toBe("himsagar-mango");
    expect(productSlugFromPath("/step/katimon-mango")).toBeNull();
    expect(productSlugFromPath("/product/katimon-mango/reviews")).toBeNull();
  });
});

describe("traffic source classification", () => {
  it("labels campaign links separately from their utm source", () => {
    expect(classifyTrafficSource({ url: "https://www.mangolover.com.bd/product/x?utm_source=facebook&utm_medium=campaign_link&utm_campaign=himsagar-reel" }))
      .toMatchObject({ source: "campaign_link", medium: "campaign_link", utm_source: "facebook", utm_campaign: "himsagar-reel" });
  });
  it("uses the referrer host for social and search visits", () => {
    expect(classifyTrafficSource({ url: "https://www.mangolover.com.bd/", referrer: "https://m.facebook.com/" })).toMatchObject({ source: "facebook", medium: "social", referrer_host: "m.facebook.com" });
    expect(classifyTrafficSource({ url: "https://www.mangolover.com.bd/", referrer: "https://www.google.com/" })).toMatchObject({ source: "google", medium: "organic" });
  });
  it("does not treat fbclid alone as a paid click", () => {
    expect(classifyTrafficSource({ url: "https://www.mangolover.com.bd/?fbclid=abc" })).toMatchObject({ source: "facebook", medium: "referral" });
    expect(classifyTrafficSource({ url: "https://www.mangolover.com.bd/?utm_source=facebook&utm_medium=cpc" })).toMatchObject({ source: "facebook", medium: "paid" });
  });
  it("calls same-site and missing referrers direct", () => {
    expect(classifyTrafficSource({ url: "https://www.mangolover.com.bd/", referrer: "https://www.mangolover.com.bd/product/x" })).toMatchObject({ source: "direct", medium: "none", referrer_host: null });
    expect(classifyTrafficSource({ url: "https://www.mangolover.com.bd/" })).toMatchObject({ source: "direct" });
  });
});

describe("tracker hit parsing", () => {
  const body = { ...ids, url: "https://www.mangolover.com.bd/product/katimon-mango?utm_source=instagram", referrer: "" };
  it("turns a page view into an event with entry attribution, device and city", () => {
    const hit = parseTrackerAnalyticsHit(body, { kind: "pageview", userAgent: "Mozilla/5.0 (iPhone) FBAV/450", country: "BD", city: "Dhaka", now });
    expect(hit).toMatchObject({ event: "page_view", path: "/product/katimon-mango", productSlug: "katimon-mango", receivedAt: "2026-10-03T08:00:00.000Z",
      entry: { source: "instagram", device: "mobile", country: "BD", city: "Dhaka" } });
  });
  it("maps explicit steps and ignores unknown ones", () => {
    expect(parseTrackerAnalyticsHit(body, { kind: "step", bucket: "cart", now })?.event).toBe("cart");
    expect(parseTrackerAnalyticsHit(body, { kind: "step", bucket: "purchased", now })?.event).toBe("purchase_signal");
    expect(parseTrackerAnalyticsHit(body, { kind: "step", bucket: "wishlist", now })).toBeNull();
  });
  it("never stores heartbeats or legacy pings without ids", () => {
    expect(parseTrackerAnalyticsHit(body, { kind: "heartbeat", now })).toBeNull();
    expect(parseTrackerAnalyticsHit({ ...body, event_id: undefined }, { kind: "pageview", now })).toBeNull();
    expect(parseTrackerAnalyticsHit({ ...body, session_id: "not-a-uuid" }, { kind: "pageview", now })).toBeNull();
  });
  it("bounds engagement time and drops empty flushes", () => {
    expect(parseTrackerAnalyticsHit({ ...body, active_seconds: 99999 }, { kind: "engage", now })?.activeSeconds).toBe(1800);
    expect(parseTrackerAnalyticsHit({ ...body, active_seconds: 0 }, { kind: "engage", now })).toBeNull();
    expect(parseTrackerAnalyticsHit({ ...body, active_seconds: "x" }, { kind: "engage", now })).toBeNull();
  });
  it("decodes city headers safely and recognises devices", () => {
    expect(parseTrackerAnalyticsHit(body, { kind: "pageview", city: "Cox%27s%20Bazar", now })?.entry.city).toBe("Cox's Bazar");
    expect(parseTrackerAnalyticsHit(body, { kind: "pageview", city: "%E0%A4", now })?.entry.city).toBe("%E0%A4");
    expect(deviceFromUserAgent("Mozilla/5.0 (Windows NT 10.0)")).toBe("desktop");
    expect(deviceFromUserAgent("Mozilla/5.0 (iPad; CPU OS 17)")).toBe("tablet");
    expect(isAnalyticsId(ids.event_id)).toBe(true);
  });
});
