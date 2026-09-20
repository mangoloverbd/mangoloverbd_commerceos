import { describe, expect, it, vi } from "vitest";
import {
  cacheState,
  resolveFraudCheck,
  selectPhonesToWarm,
  shouldWarm,
} from "../../server/fraudShield.js";

const NOW = new Date("2026-09-19T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const DAY = 86_400_000;
const HOUR = 3_600_000;

describe("cacheState", () => {
  it("treats an absent row as missing", () => {
    expect(cacheState(null, NOW)).toBe("missing");
  });

  it("keeps an ok row fresh inside the 30-day window", () => {
    expect(cacheState({ status: "ok", checked_at: ago(29 * DAY) }, NOW)).toBe("fresh");
  });

  it("stales an ok row past the window", () => {
    expect(cacheState({ status: "ok", checked_at: ago(31 * DAY) }, NOW)).toBe("stale");
  });

  it("holds an error row for one hour before allowing a retry", () => {
    expect(cacheState({ status: "error", checked_at: ago(30 * 60_000) }, NOW)).toBe("fresh");
    expect(cacheState({ status: "error", checked_at: ago(2 * HOUR) }, NOW)).toBe("stale");
  });

  it("reports a recent pending row as claimed and an old one as stale", () => {
    expect(cacheState({ status: "pending", checked_at: ago(10_000) }, NOW)).toBe("claimed");
    expect(cacheState({ status: "pending", checked_at: ago(120_000) }, NOW)).toBe("stale");
  });
});

describe("resolveFraudCheck", () => {
  function harness(existing: unknown, apiResult: unknown) {
    const writes: unknown[] = [];
    return {
      writes,
      readCache: vi.fn().mockResolvedValue(existing),
      writeCache: vi.fn(async (patch: unknown) => { writes.push(patch); }),
      callApi: vi.fn().mockResolvedValue(apiResult),
    };
  }

  const OK_API = { payload: { courierData: {} }, summary: { total_parcels: 3 }, errorMessage: null };

  it("returns a fresh row without spending a request", async () => {
    const existing = { status: "ok", checked_at: ago(DAY), payload: { a: 1 }, summary: { b: 2 } };
    const h = harness(existing, OK_API);

    const result = await resolveFraudCheck({ ...h, now: NOW, force: false });

    expect(h.callApi).not.toHaveBeenCalled();
    expect(h.writeCache).not.toHaveBeenCalled();
    expect(result.spentRequest).toBe(false);
    expect(result.row).toBe(existing);
  });

  it("calls the API for a missing row and claims before calling", async () => {
    const h = harness(null, OK_API);

    const result = await resolveFraudCheck({ ...h, now: NOW, force: false });

    expect(h.callApi).toHaveBeenCalledOnce();
    expect(h.writes[0]).toMatchObject({ status: "pending" });
    expect(h.writes[1]).toMatchObject({ status: "ok", payload: { courierData: {} }, summary: { total_parcels: 3 }, error_message: null });
    expect(result.spentRequest).toBe(true);
  });

  it("re-checks a fresh row when forced", async () => {
    const h = harness({ status: "ok", checked_at: ago(DAY) }, OK_API);

    const result = await resolveFraudCheck({ ...h, now: NOW, force: true });

    expect(h.callApi).toHaveBeenCalledOnce();
    expect(result.spentRequest).toBe(true);
  });

  it("skips a phone another worker is already checking, even when forced", async () => {
    const h = harness({ status: "pending", checked_at: ago(5_000) }, OK_API);

    const result = await resolveFraudCheck({ ...h, now: NOW, force: true });

    expect(h.callApi).not.toHaveBeenCalled();
    expect(result.skipped).toBe("claimed");
    expect(result.spentRequest).toBe(false);
  });

  it("preserves the previous good payload when a re-check fails", async () => {
    const existing = { status: "ok", checked_at: ago(40 * DAY), payload: { keep: true }, summary: { total_parcels: 9 } };
    const h = harness(existing, { payload: null, summary: null, errorMessage: "FraudShield 502" });

    const result = await resolveFraudCheck({ ...h, now: NOW, force: false });

    expect(h.writes[1]).toMatchObject({
      status: "error",
      error_message: "FraudShield 502",
      payload: { keep: true },
      summary: { total_parcels: 9 },
    });
    expect(result.row.payload).toEqual({ keep: true });
  });

  it("stores a bare error row when there was nothing cached to preserve", async () => {
    const h = harness(null, { payload: null, summary: null, errorMessage: "No API key provided" });

    await resolveFraudCheck({ ...h, now: NOW, force: false });

    expect(h.writes[1]).toMatchObject({ status: "error", payload: null, summary: null, error_message: "No API key provided" });
  });
});

describe("shouldWarm", () => {
  it("allows warming with headroom above the reserve", () => {
    expect(shouldWarm({ remaining_today: 400 }, 100)).toBe(true);
  });

  it("stops warming at or below the reserve", () => {
    expect(shouldWarm({ remaining_today: 100 }, 100)).toBe(false);
    expect(shouldWarm({ remaining_today: 0 }, 100)).toBe(false);
  });

  it("fails closed when usage is unknown", () => {
    expect(shouldWarm(null, 100)).toBe(false);
    expect(shouldWarm({}, 100)).toBe(false);
  });
});

describe("selectPhonesToWarm", () => {
  const orders = [
    { phone: "01711111111", created_at: "2026-09-19T10:00:00Z" },
    { phone: "8801722222222", created_at: "2026-09-19T09:00:00Z" },
    { phone: "01711111111", created_at: "2026-09-19T08:00:00Z" },
    { phone: "01733333333", created_at: "2026-09-19T07:00:00Z" },
    { phone: "not-a-phone", created_at: "2026-09-19T06:00:00Z" },
    { phone: null, created_at: "2026-09-19T05:00:00Z" },
  ];

  it("normalizes, deduplicates, and drops phones that already have a fresh row", () => {
    const cachedRows = [{ phone: "01733333333", status: "ok", checked_at: ago(DAY) }];

    expect(selectPhonesToWarm({ orders, cachedRows, now: NOW, limit: 10 }))
      .toEqual(["01711111111", "01722222222"]);
  });

  it("re-warms a phone whose cached row has gone stale", () => {
    const cachedRows = [{ phone: "01733333333", status: "ok", checked_at: ago(60 * DAY) }];

    expect(selectPhonesToWarm({ orders, cachedRows, now: NOW, limit: 10 }))
      .toContain("01733333333");
  });

  it("honours the batch limit", () => {
    expect(selectPhonesToWarm({ orders, cachedRows: [], now: NOW, limit: 2 }))
      .toEqual(["01711111111", "01722222222"]);
  });

  it("returns nothing when every phone is cached", () => {
    const cachedRows = [
      { phone: "01711111111", status: "ok", checked_at: ago(DAY) },
      { phone: "01722222222", status: "ok", checked_at: ago(DAY) },
      { phone: "01733333333", status: "ok", checked_at: ago(DAY) },
    ];

    expect(selectPhonesToWarm({ orders, cachedRows, now: NOW, limit: 10 })).toEqual([]);
  });
});
