import { describe, expect, it } from "vitest";
import { getTrustedRequestIp, networkKey } from "../../server/risk/network.js";

describe("risk network identity", () => {
  it("uses the proxy header order, validates IPs and ignores Cloudflare", () => {
    expect(getTrustedRequestIp({ headers: { "cf-connecting-ip": "198.51.100.9", "x-vercel-forwarded-for": "103.12.44.7", "x-real-ip": "203.0.113.2" } })).toBe("103.12.44.7");
    expect(getTrustedRequestIp({ headers: { "x-vercel-forwarded-for": "bad", "x-real-ip": "203.0.113.2" } })).toBe("203.0.113.2");
    expect(getTrustedRequestIp({ headers: { "x-forwarded-for": "203.0.113.3, 10.0.0.1" } })).toBe("203.0.113.3");
    expect(getTrustedRequestIp({ headers: { "cf-connecting-ip": "198.51.100.9" }, socket: { remoteAddress: "10.0.0.5" } })).toBe("10.0.0.5");
  });
  it("collapses IPv4 /24, IPv6 /64 and mapped IPv4", () => {
    expect(networkKey("103.12.44.7")).toBe("v4:103.12.44.0/24");
    expect(networkKey("2001:0db8:0001:0002::abcd")).toBe("v6:2001:db8:1:2::/64");
    expect(networkKey("2001:db8:1:2:3:4:5:6")).toBe("v6:2001:db8:1:2::/64");
    expect(networkKey("::ffff:103.12.44.7")).toBe("v4:103.12.44.0/24");
    expect(networkKey("::ffff:670c:2c07")).toBe("v4:103.12.44.0/24");
    expect(networkKey("invalid")).toBeNull();
  });
});
