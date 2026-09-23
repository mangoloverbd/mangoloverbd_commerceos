import { describe, expect, test, vi } from "vitest";

import {
  calculateProtectionScore,
  detectDeterministicSignals,
  evaluateProtection,
  normalizeProtectionInput,
} from "../../server/orderSubmissionProtection.js";

const normalInput = (overrides: Record<string, unknown> = {}) => ({
  orgId: "org-1",
  route: "public_v1",
  customerName: "Rahim Uddin",
  phone: "01712345678",
  address: "ধানমন্ডি ৮ নম্বর রোড, বাড়ি ১২, ঢাকা",
  items: [{ productId: "product-1", variantId: "variant-1", quantity: 1 }],
  clientSessionId: "session-1234567890",
  checkoutStartedAt: new Date(Date.now() - 45_000).toISOString(),
  ...overrides,
});

const safeDependencies = (overrides: Record<string, unknown> = {}) => ({
  countPhoneAttempts: async () => ({ last15m: 0, last1h: 0, last24h: 0 }),
  countPhoneSessions: async () => 1,
  countPhoneNetworks: async () => 1,
  isDuplicate: async () => false,
  validateTurnstile: async () => ({ ok: true }),
  ...overrides,
});

describe("order submission protection", () => {
  test("no address validator is required; vague addresses get deterministic review", async () => {
    const normal = await evaluateProtection(normalInput(), safeDependencies({ validateAddress: undefined }));
    const vague = await evaluateProtection(normalInput({ address: "near the market" }), safeDependencies({ validateAddress: undefined }));
    expect(normal.decision).toBe("ALLOW");
    expect(vague).toMatchObject({ decision: "REVIEW", reasonCodes: ["address_too_vague"] });
  });

  test("blocks a filled honeypot before external checks", async () => {
    const validateTurnstile = vi.fn();
    const result = await evaluateProtection(
      normalInput({ website: "https://spam.test" }),
      safeDependencies({ validateTurnstile }),
    );

    expect(result).toMatchObject({ decision: "BLOCK", reasonCodes: ["honeypot_filled"] });
    expect(validateTurnstile).not.toHaveBeenCalled();
  });

  test("blocks abusive or obvious test content without treating Banglish as abuse", async () => {
    const abusive = await evaluateProtection(
      normalInput({ notes: "asdf test order গালি" }),
      safeDependencies(),
    );
    const normalBanglish = await evaluateProtection(
      normalInput({ address: "Mirpur 10, lane 3, house 14" }),
      safeDependencies(),
    );

    expect(abusive.decision).toBe("BLOCK");
    expect(abusive.reasonCodes).toEqual(expect.arrayContaining([
      "abusive_content",
      "test_or_fake_content",
    ]));
    expect(normalBanglish.decision).toBe("ALLOW");
  });


  test("blocks Romanized Bangla harassment in customer-supplied fields before external checks", async () => {
    const validateTurnstile = vi.fn();
    const result = await evaluateProtection(
      normalInput({ address: "ami ekta bokachoda" }),
      safeDependencies({ validateTurnstile }),
    );

    expect(result).toMatchObject({ decision: "BLOCK", reasonCodes: ["abusive_content"] });
    expect(validateTurnstile).not.toHaveBeenCalled();
  });

  test("holds repeated phone, session, and network signals at the review threshold", async () => {
    const result = await evaluateProtection(
      normalInput(),
      safeDependencies({
        countPhoneAttempts: async () => ({ last15m: 3, last1h: 5, last24h: 8 }),
        countPhoneSessions: async () => 3,
        countPhoneNetworks: async () => 2,
      }),
    );

    expect(result.decision).toBe("REVIEW");
    expect(result.score).toBe(90);
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      "phone_velocity_15m",
      "phone_velocity_1h",
      "phone_velocity_24h",
      "phone_many_sessions",
      "phone_network_change",
    ]));
  });

  test("holds a second order from the same phone within fifteen minutes", async () => {
    const result = await evaluateProtection(
      normalInput(),
      safeDependencies({
        countPhoneAttempts: async () => ({ last15m: 1, last1h: 1, last24h: 1 }),
      }),
    );

    expect(result).toMatchObject({ decision: "REVIEW", reasonCodes: ["phone_velocity_15m"] });
  });

  test("blocks an exact duplicate", async () => {
    const result = await evaluateProtection(
      normalInput(),
      safeDependencies({ isDuplicate: async () => true }),
    );

    expect(result.decision).toBe("BLOCK");
    expect(result.reasonCodes).toContain("duplicate_submission");
  });

  test("returns input blocks for missing, short, and vague addresses", async () => {
    const missing = await evaluateProtection(normalInput({ address: "" }), safeDependencies());
    const short = await evaluateProtection(normalInput({ address: "Dhaka" }), safeDependencies());
    const vague = await evaluateProtection(normalInput({ address: "near the market" }), safeDependencies());

    expect(missing).toMatchObject({ decision: "BLOCK", reasonCodes: ["address_missing"] });
    expect(short).toMatchObject({ decision: "BLOCK", reasonCodes: ["address_too_short"] });
    expect(vague.decision).toBe("REVIEW");
    expect(vague.reasonCodes).toContain("address_too_vague");
  });

  test("failed Turnstile adds 20 points and holds, while unconfigured adds nothing", async () => {
    const failed = await evaluateProtection(normalInput(), safeDependencies({ validateTurnstile: async () => ({ ok: false }) }));
    const unavailable = await evaluateProtection(normalInput(), safeDependencies({ validateTurnstile: async () => ({ ok: false, unavailable: true }) }));
    const unconfigured = await evaluateProtection(normalInput(), safeDependencies({ validateTurnstile: async () => ({ ok: false, unconfigured: true }) }));
    expect(failed).toMatchObject({ decision: "REVIEW", score: 20, reasonCodes: ["turnstile_failed"] });
    expect(unavailable).toMatchObject({ decision: "REVIEW", reasonCodes: ["turnstile_failed"] });
    expect(unconfigured).toMatchObject({ decision: "ALLOW", score: 0, reasonCodes: [] });
  });

  test("normalizes bounded input and calculates deterministic scores", () => {
    const input = normalizeProtectionInput(normalInput({
      customerName: "  Rahim Uddin ",
      phone: "01712-345678",
      clientSessionId: " session-1234567890 ",
    }));
    const signals = detectDeterministicSignals(input);

    expect(input.customerName).toBe("Rahim Uddin");
    expect(input.phone).toBe("01712345678");
    expect(input.clientSessionId).toBe("session-1234567890");
    expect(calculateProtectionScore({
      phoneVelocity15m: true,
      phoneVelocity1h: true,
      phoneVelocity24h: false,
      phoneManySessions: false,
      phoneNetworkChange: false,
      checkoutTooFast: false,
      addressVague: false,
    })).toBe(45);
    expect(signals.honeypotFilled).toBe(false);
  });
});
