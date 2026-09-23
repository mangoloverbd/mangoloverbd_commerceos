import { describe, expect, it } from "vitest";
import { FAMILIES, SEVERITY_POINTS, SIGNAL_DEFINITIONS, THRESHOLDS, createSignal } from "../../server/risk/signals.js";
import { decideRisk } from "../../server/risk/decide.js";

const signals = (...codes: string[]) => codes.map(code => createSignal(code, "Synthetic evidence without identifiers"));

describe("deterministic risk decision", () => {
  it("publishes the contracted families, scores and thresholds", () => {
    expect(FAMILIES).toEqual(["IDENTITY", "DEVICE", "NETWORK", "BEHAVIOUR", "CONTENT", "LOCATION", "HISTORY", "LIST"]);
    expect(SEVERITY_POINTS).toEqual({ critical: 100, high: 40, medium: 20, low: 10 });
    expect(THRESHOLDS).toMatchObject({ holdScore: 40, blockScore: 100, blockMinHighFamilies: 2, fastCheckoutSeconds: 12, unusualLineQuantity: 10 });
    expect(Object.keys(SIGNAL_DEFINITIONS)).toHaveLength(32);
    expect(() => createSignal("unknown", "evidence")).toThrow();
  });

  it("allowlist wins, but trust credit never cancels a critical signal", () => {
    expect(decideRisk({ signals: signals("staff_allowlist", "blocklist_phone"), contextTrusted: true }).decision).toBe("ALLOW");
    const critical = decideRisk({ signals: signals("test_content", "trusted_delivered_customer"), contextTrusted: true });
    expect(critical).toMatchObject({ decision: "HOLD", reasons: ["critical:test_content"] });
    expect(decideRisk({ signals: signals("blocklist_phone"), contextTrusted: true }).decision).toBe("BLOCK");
    expect(decideRisk({ signals: signals("honeypot_filled"), contextTrusted: true }).decision).toBe("HOLD");
  });

  it("requires two high families to block at 100 points", () => {
    const oneFamily = decideRisk({ signals: signals("phone_many_devices", "phone_burst_15m", "phone_velocity_24h"), contextTrusted: true });
    expect(oneFamily).toMatchObject({ decision: "HOLD", score: 100 });
    const independent = decideRisk({ signals: signals("device_many_phones", "phone_fake_history", "phone_velocity_24h"), contextTrusted: true });
    expect(independent).toMatchObject({ decision: "HOLD", score: 100 });
  });

  it("a customer retrying repeatedly is held for a call, never blocked", () => {
    const retries = decideRisk({ signals: signals("phone_burst_15m", "device_burst_15m", "phone_velocity_24h", "phone_many_devices"), contextTrusted: true });
    expect(retries).toMatchObject({ decision: "HOLD", score: 140 });
  });

  it("does not hold solely for geography, missing context, or unavailable dependencies", () => {
    expect(decideRisk({ signals: signals("hater_region_ip"), contextTrusted: true }).decision).toBe("ALLOW");
    expect(decideRisk({ signals: signals("hater_region_ip", "trusted_delivered_customer"), contextTrusted: true }).decision).toBe("ALLOW");
    for (const options of [{ contextTrusted: false }, { contextTrusted: true, dependencyUnavailable: true }, { contextTrusted: true, engineError: true }]) {
      expect(decideRisk({ signals: [], ...options }).decision).toBe("ALLOW");
    }
    expect(decideRisk({ signals: signals("very_fast_checkout", "name_suspicious"), contextTrusted: true }).decision).toBe("ALLOW");
    expect(decideRisk({ signals: signals("courier_no_history", "address_incomplete"), contextTrusted: true }).decision).toBe("ALLOW");
    expect(decideRisk({ signals: signals("honeypot_filled"), contextTrusted: true }).decision).toBe("HOLD");
  });
});
