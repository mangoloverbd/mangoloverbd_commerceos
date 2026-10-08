import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  fetchFraudSources,
  fetchSteadfastScore,
  mergeSteadfastScore,
} from "../../server/fraudShield.js";

const FRAUDSHIELD_BODY = {
  courierData: {
    summary: { name: "Summary", total_parcel: 14, success_parcel: 14, cancelled_parcel: 0, success_ratio: 100 },
    pathao: { name: "Pathao", logo: "https://x/p.png", total_parcel: 13, success_parcel: 13, cancelled_parcel: 0, success_ratio: 100 },
    steadfast: { name: "SteadFast", logo: "https://x/s.png", total_parcel: 0, success_parcel: 0, cancelled_parcel: 0, success_ratio: 0 },
  },
  fraudRiskScore: { score: 2, level: "low", label: "নিরাপদ" },
};

// Shape of a live `fraud_check/score` response, captured 2026-10-06.
const STEADFAST_SCORE = {
  status: 200,
  phone: "01713265287",
  score: null,
  level: null,
  reasons: [],
  scoring_disabled: true,
  doubtful_reports: false,
  total_reports: 0,
  delivery_ratio: 100,
  cancellation_ratio: 0,
  volume_band: "high",
  volume_range: "25+",
  fraud_categories: [],
  return_ratio: 0,
};

// jsdom lacks AbortSignal.timeout, which the server's Node runtime provides.
beforeAll(() => {
  if (typeof AbortSignal.timeout !== "function") {
    AbortSignal.timeout = () => new AbortController().signal;
  }
});

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

describe("fetchSteadfastScore", () => {
  it("calls the score endpoint with the merchant's own Steadfast keys", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(STEADFAST_SCORE));
    const result = await fetchSteadfastScore("01713265287", { apiKey: "a", secretKey: "s" }, fetchImpl);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://portal.packzy.com/api/v1/fraud_check/score/01713265287");
    expect(init.headers["Api-Key"]).toBe("a");
    expect(init.headers["Secret-Key"]).toBe("s");
    expect(result).toEqual({ score: STEADFAST_SCORE, errorMessage: null });
  });

  it("skips the call when the keys are not configured", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchSteadfastScore("01713265287", { apiKey: "", secretKey: "s" }, fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.score).toBeNull();
  });

  it("treats a response without ratios or volume as a failure, not a zero", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 200 }));
    const result = await fetchSteadfastScore("01713265287", { apiKey: "a", secretKey: "s" }, fetchImpl);

    expect(result.score).toBeNull();
    expect(result.errorMessage).toBeTruthy();
  });

  it("reports gateway and network failures without throwing", async () => {
    const gateway = vi.fn().mockResolvedValue({ ok: false, status: 504, text: async () => "<html>" });
    expect((await fetchSteadfastScore("01713265287", { apiKey: "a", secretKey: "s" }, gateway)).score).toBeNull();

    const offline = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const result = await fetchSteadfastScore("01713265287", { apiKey: "a", secretKey: "s" }, offline);
    expect(result.score).toBeNull();
    expect(result.errorMessage).toContain("ECONNRESET");
  });
});

describe("mergeSteadfastScore", () => {
  it("replaces FraudShield's Steadfast row with Steadfast's own figures", () => {
    const merged = mergeSteadfastScore(FRAUDSHIELD_BODY, STEADFAST_SCORE);

    expect(merged.courierData.steadfast).toEqual({
      name: "SteadFast",
      logo: "https://x/s.png",
      total_parcel: 25,
      success_parcel: 25,
      cancelled_parcel: 0,
      success_ratio: 100,
      volume_range: "25+",
      source: "steadfast",
    });
    expect(merged.courierData.pathao).toEqual(FRAUDSHIELD_BODY.courierData.pathao);
    expect(FRAUDSHIELD_BODY.courierData.steadfast.total_parcel).toBe(0);
  });

  it("uses the bottom of a bounded range and splits it by the ratios", () => {
    const merged = mergeSteadfastScore(FRAUDSHIELD_BODY, {
      ...STEADFAST_SCORE,
      delivery_ratio: 66,
      cancellation_ratio: 33,
      volume_band: "medium",
      volume_range: "6-20",
    });

    expect(merged.courierData.steadfast).toMatchObject({ total_parcel: 6, success_parcel: 4, cancelled_parcel: 2, success_ratio: 66 });
  });

  it("records no parcels when Steadfast has no history for the number", () => {
    const merged = mergeSteadfastScore(FRAUDSHIELD_BODY, {
      ...STEADFAST_SCORE,
      delivery_ratio: null,
      cancellation_ratio: null,
      volume_band: "none",
      volume_range: null,
    });

    expect(merged.courierData.steadfast).toMatchObject({ total_parcel: 0, success_parcel: 0, cancelled_parcel: 0 });
  });
});

describe("fetchFraudSources", () => {
  function routedFetch(steadfast: unknown) {
    return vi.fn(async (url: string) =>
      url.includes("packzy") ? (steadfast as ReturnType<typeof jsonResponse>) : jsonResponse(FRAUDSHIELD_BODY),
    );
  }

  it("folds Steadfast's own count into the summary", async () => {
    const fetchImpl = routedFetch(jsonResponse(STEADFAST_SCORE));
    const result = await fetchFraudSources("01713265287", {
      fraudShieldKey: "fs",
      steadfast: { apiKey: "a", secretKey: "s" },
      fetchImpl,
    });

    expect(result.errorMessage).toBeNull();
    expect(result.summary.apis.SteadFast).toEqual({ total_parcels: 25, total_delivered_parcels: 25, total_cancelled_parcels: 0 });
    expect(result.summary.total_parcels).toBe(38);
  });

  it("keeps FraudShield's Steadfast row when Steadfast's API fails", async () => {
    const fetchImpl = routedFetch({ ok: false, status: 504, text: async () => "" });
    const result = await fetchFraudSources("01713265287", {
      fraudShieldKey: "fs",
      steadfast: { apiKey: "a", secretKey: "s" },
      fetchImpl,
    });

    expect(result.errorMessage).toBeNull();
    expect(result.payload.courierData.steadfast).toEqual(FRAUDSHIELD_BODY.courierData.steadfast);
  });

  it("still reports a FraudShield failure as the check's error", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("packzy") ? jsonResponse(STEADFAST_SCORE) : { ok: false, status: 502, text: async () => "" },
    );
    const result = await fetchFraudSources("01713265287", {
      fraudShieldKey: "fs",
      steadfast: { apiKey: "a", secretKey: "s" },
      fetchImpl,
    });

    expect(result.payload).toBeNull();
    expect(result.errorMessage).toContain("502");
  });
});
