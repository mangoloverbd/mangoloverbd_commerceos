import { describe, expect, test, vi } from "vitest";

import { protectOrderSubmission } from "../../server/orderProtectionPipeline.js";

const input = {
  orgId: "org-1",
  route: "public_v1",
  customerName: "Rahim Uddin",
  phone: "01712345678",
  address: "ধানমন্ডি ৮ নম্বর রোড, বাড়ি ১২, ঢাকা",
  items: [{ productId: "product-1", variantId: "variant-1", quantity: 1 }],
  clientSessionId: "session-1",
  checkoutStartedAt: new Date(Date.now() - 45_000).toISOString(),
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    secret: "test-secret-123456",
    redis: {
      exists: vi.fn().mockResolvedValue(0),
      set: vi.fn().mockResolvedValue("OK"),
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      sadd: vi.fn().mockResolvedValue(1),
      scard: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(0),
    },
    supabase: {
      from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
    },
    verifyTurnstile: async () => ({ ok: true }),
    validateAddress: vi.fn(),
    ...overrides,
  };
}

describe("order protection pipeline", () => {
  test("blocks without reserving an order fingerprint for a honeypot submission", async () => {
    const deps = dependencies();
    const result = await protectOrderSubmission({
      input: { ...input, website: "spam" },
      requestMeta: { ip: "203.0.113.5", userAgent: "browser" },
      dependencies: deps,
    });

    expect(result.protection).toMatchObject({ decision: "BLOCK", reasonCodes: ["honeypot_filled"] });
    expect(deps.redis.set).not.toHaveBeenCalled();
  });

  test("creates a held review and records an event without creating a normal order", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({
      insert,
      select: () => ({ single: async () => ({ data: { id: "review-1", status: "on_hold" }, error: null }) }),
    })) };
    const createReview = vi.fn().mockResolvedValue({ id: "review-1", status: "on_hold" });
    const result = await protectOrderSubmission({
      input,
      requestMeta: { ip: "203.0.113.5", userAgent: "browser" },
      dependencies: dependencies({
        supabase,
        countPhoneAttempts: async () => ({ last15m: 3, last1h: 5, last24h: 8 }),
        countPhoneSessions: async () => 3,
        countPhoneNetworks: async () => 2,
        createReview,
      }),
    });

    expect(result.protection.decision).toBe("REVIEW");
    expect(result.review).toEqual({ id: "review-1", status: "on_hold" });
    expect(createReview).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalled();
  });
});
