import { describe, expect, it, vi } from "vitest";
import {
  FRAUD_CACHE_TTL_DAYS,
  deriveFraudSummary,
  fetchFraudShield,
  parseFraudShieldError,
} from "../../server/fraudShield.js";

const OK_BODY = {
  courierData: {
    summary: { name: "Summary", total_parcel: 45, success_parcel: 42, cancelled_parcel: 3, success_ratio: 93.33 },
    steadfast: { name: "Steadfast", logo: "https://x/s.png", total_parcel: 25, success_parcel: 24, cancelled_parcel: 1, success_ratio: 96 },
    pathao: { name: "Pathao", logo: "https://x/p.png", total_parcel: 10, success_parcel: 9, cancelled_parcel: 1, success_ratio: 90 },
  },
  reviews: [
    { phone: "01700000000", commenter_phone: "01800000000", name: "Rahim", rating: 5, comment: "Genuine buyer.", created_at: "2026-05-01T10:15:00.000000Z" },
  ],
  fraudRiskScore: { score: 12, level: "safe", label: "নিরাপদ", breakdown: { success: 6, reports: 0, cancel: 4, volume: 2 } },
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("parseFraudShieldError", () => {
  it("explains upstream gateway failures in operator language", () => {
    expect(parseFraudShieldError(502, "")).toContain("502 Bad Gateway");
    expect(parseFraudShieldError(504, "")).toContain("504 Gateway Timeout");
  });

  it("names the credential problem on auth failures", () => {
    expect(parseFraudShieldError(401, '{"message":"nope"}')).toContain("Invalid or expired API key");
    expect(parseFraudShieldError(403, '{"message":"nope"}')).toContain("Invalid or expired API key");
  });

  it("reports quota exhaustion distinctly from other 4xx", () => {
    const message = parseFraudShieldError(429, '{"message":"Too Many Requests"}');
    expect(message).toMatch(/daily FraudShield limit/i);
    expect(message).not.toContain("Invalid or expired API key");
  });

  it("surfaces validation detail for a rejected phone", () => {
    const message = parseFraudShieldError(400, '{"message":"The phone field format is invalid."}');
    expect(message).toContain("The phone field format is invalid.");
  });

  it("still handles the BD Courier upstream failure signature", () => {
    expect(parseFraudShieldError(500, "BdCourierService null returned")).toMatch(/BD Courier data/i);
  });
});

describe("deriveFraudSummary", () => {
  it("produces the exact legacy summary shape OrdersTable reads", () => {
    const summary = deriveFraudSummary(OK_BODY, "01700000000");

    expect(summary).toEqual({
      mobile_number: "01700000000",
      total_parcels: 35,
      total_delivered: 33,
      total_cancel: 2,
      fraud_risk: "safe",
      success_rate: 94,
      last_delivery: "",
      apis: {
        Steadfast: { total_parcels: 25, total_delivered_parcels: 24, total_cancelled_parcels: 1 },
        Pathao: { total_parcels: 10, total_delivered_parcels: 9, total_cancelled_parcels: 1 },
      },
    });
  });

  it("excludes the API's own summary aggregate so totals are not double-counted", () => {
    const summary = deriveFraudSummary(OK_BODY, "01700000000");

    expect(summary.apis).not.toHaveProperty("Summary");
    expect(summary.total_parcels).toBe(35);
  });

  it("falls back to a ratio-derived risk level when the API omits fraudRiskScore", () => {
    const body = { courierData: { steadfast: { name: "Steadfast", total_parcel: 10, success_parcel: 4, cancelled_parcel: 6 } } };
    expect(deriveFraudSummary(body, "01700000000").fraud_risk).toBe("high");
  });

  it("reports a zero success rate rather than dividing by zero", () => {
    const body = { courierData: { steadfast: { name: "Steadfast", total_parcel: 0, success_parcel: 0, cancelled_parcel: 0 } } };
    expect(deriveFraudSummary(body, "01700000000").success_rate).toBe(0);
  });
});

describe("fetchFraudShield", () => {
  it("retains the complete upstream payload, not just the summary", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(OK_BODY));
    const result = await fetchFraudShield("01700000000", "key-1", fetchImpl);

    expect(result.errorMessage).toBeNull();
    expect(result.payload).toEqual(OK_BODY);
    expect(result.payload.reviews).toHaveLength(1);
    expect(result.payload.fraudRiskScore.label).toBe("নিরাপদ");
    expect(result.payload.courierData.steadfast.success_ratio).toBe(96);
    expect(result.summary.total_parcels).toBe(35);
  });

  it("authenticates with both header styles and posts the cleaned phone", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(OK_BODY));
    await fetchFraudShield("01700000000", "key-1", fetchImpl);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://fraudshield.bd/api/customer/check");
    expect(init.headers.Authorization).toBe("Bearer key-1");
    expect(init.headers["X-API-Key"]).toBe("key-1");
    expect(JSON.parse(init.body)).toEqual({ phone: "01700000000" });
  });

  it("returns an error without calling the API when the key is missing", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchFraudShield("01700000000", "", fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.errorMessage).toBe("No API key provided");
    expect(result.payload).toBeNull();
  });

  it("maps a non-ok response to a parsed error and no payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "{}" });
    const result = await fetchFraudShield("01700000000", "key-1", fetchImpl);

    expect(result.payload).toBeNull();
    expect(result.summary).toBeNull();
    expect(result.errorMessage).toMatch(/daily FraudShield limit/i);
  });

  it("reports malformed JSON rather than throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error("bad json"); },
      text: async () => "<html>",
    });
    const result = await fetchFraudShield("01700000000", "key-1", fetchImpl);

    expect(result.errorMessage).toMatch(/invalid JSON/i);
  });

  it("rejects a response missing courierData", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    const result = await fetchFraudShield("01700000000", "key-1", fetchImpl);

    expect(result.errorMessage).toMatch(/Unexpected response/i);
  });

  it("converts a thrown network error into a message", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const result = await fetchFraudShield("01700000000", "key-1", fetchImpl);

    expect(result.errorMessage).toBe("Network error: ECONNRESET");
  });
});

describe("constants", () => {
  it("pins the cache window the cost model depends on", () => {
    expect(FRAUD_CACHE_TTL_DAYS).toBe(30);
  });
});
