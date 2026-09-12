import { describe, expect, test, vi } from "vitest";

import {
  calculateProtectionScore,
  detectDeterministicSignals,
  evaluateProtection,
  normalizeProtectionInput,
  parseAddressValidationResult,
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
  validateAddress: vi.fn(async () => ({
    action: "allow",
    addressValid: true,
    addressPresent: true,
    abuse: false,
    testOrFake: false,
    vague: false,
    riskScore: 5,
    reason: "specific",
  })),
  ...overrides,
});

describe("order submission protection", () => {
  test("allows a normal Bangla address after the all-order AI assessment", async () => {
    const validateAddress = vi.fn(async () => ({
      action: "allow",
      addressValid: true,
      addressPresent: true,
      abuse: false,
      testOrFake: false,
      vague: false,
      riskScore: 5,
      reason: "specific",
    }));
    const result = await evaluateProtection(
      normalInput({ address: "ধানমন্ডি ৮ নম্বর রোড, বাড়ি ১২, ঢাকা" }),
      safeDependencies({ validateAddress }),
    );

    expect(result.decision).toBe("ALLOW");
    expect(result.reasonCodes).toEqual([]);
    expect(validateAddress).toHaveBeenCalledOnce();
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

  test("blocks gibberish addresses from the AI assessment", async () => {
    const validateAddress = vi.fn(async () => ({
      action: "block",
      addressValid: false,
      addressPresent: true,
      abuse: false,
      testOrFake: true,
      vague: true,
      riskScore: 95,
      reason: "Random text is not a delivery address",
    }));
    const result = await evaluateProtection(
      normalInput({ address: "ghfbwsh dugejgheu ahihw" }),
      safeDependencies({ validateAddress }),
    );

    expect(result).toMatchObject({ decision: "BLOCK" });
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["test_or_fake_content", "address_invalid"]));
    expect(validateAddress).toHaveBeenCalledOnce();
  });

  test("blocks AI-detected harassment even when local word filters do not match it", async () => {
    const validateAddress = vi.fn(async () => ({
      action: "block",
      addressValid: true,
      addressPresent: true,
      abuse: true,
      testOrFake: false,
      vague: false,
      riskScore: 90,
      reason: "Abusive customer text",
    }));
    const result = await evaluateProtection(
      normalInput({ address: "House 1 Road 2 Dhaka" }),
      safeDependencies({ validateAddress }),
    );

    expect(result).toMatchObject({ decision: "BLOCK", reasonCodes: ["abusive_content"] });
    expect(validateAddress).toHaveBeenCalledOnce();
  });

  test("fails closed when the required all-order AI assessment is unavailable", async () => {
    const result = await evaluateProtection(
      normalInput(),
      safeDependencies({ validateAddress: async () => ({ unavailable: true }) }),
    );

    expect(result).toMatchObject({
      decision: "BLOCK",
      retryable: true,
      reasonCodes: ["address_validation_unavailable"],
    });
  });

  test("blocks Romanized Bangla harassment in customer-supplied fields before external checks", async () => {
    const validateTurnstile = vi.fn();
    const validateAddress = vi.fn();
    const result = await evaluateProtection(
      normalInput({ address: "ami ekta bokachoda" }),
      safeDependencies({ validateTurnstile, validateAddress }),
    );

    expect(result).toMatchObject({ decision: "BLOCK", reasonCodes: ["abusive_content"] });
    expect(validateTurnstile).not.toHaveBeenCalled();
    expect(validateAddress).not.toHaveBeenCalled();
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

  test("blocks an exact duplicate and never calls address AI", async () => {
    const validateAddress = vi.fn();
    const result = await evaluateProtection(
      normalInput(),
      safeDependencies({ isDuplicate: async () => true, validateAddress }),
    );

    expect(result.decision).toBe("BLOCK");
    expect(result.reasonCodes).toContain("duplicate_submission");
    expect(validateAddress).not.toHaveBeenCalled();
  });

  test("returns input blocks for missing, short, and vague addresses", async () => {
    const missing = await evaluateProtection(normalInput({ address: "" }), safeDependencies());
    const short = await evaluateProtection(normalInput({ address: "Dhaka" }), safeDependencies());
    const vague = await evaluateProtection(normalInput({ address: "near the market" }), safeDependencies({
      validateAddress: async () => ({
        action: "review",
        addressValid: true,
        addressPresent: true,
        abuse: false,
        testOrFake: false,
        vague: true,
        riskScore: 45,
        reason: "Needs a more specific delivery location",
      }),
    }));

    expect(missing).toMatchObject({ decision: "BLOCK", reasonCodes: ["address_missing"] });
    expect(short).toMatchObject({ decision: "BLOCK", reasonCodes: ["address_too_short"] });
    expect(vague.decision).toBe("REVIEW");
    expect(vague.reasonCodes).toContain("address_too_vague");
  });

  test("fails closed when Turnstile or all-order address AI is unavailable", async () => {
    const turnstile = await evaluateProtection(normalInput(), safeDependencies({
      validateTurnstile: async () => ({ ok: false }),
    }));
    const aiUnavailable = await evaluateProtection(
      normalInput({ address: "near the market" }),
      safeDependencies({ validateAddress: async () => ({ unavailable: true }) }),
    );

    expect(turnstile).toMatchObject({ decision: "BLOCK", reasonCodes: ["turnstile_failed"] });
    expect(aiUnavailable).toMatchObject({
      decision: "BLOCK",
      retryable: true,
      reasonCodes: ["address_validation_unavailable"],
    });
  });

  test("parses only strict bounded address-validation JSON", () => {
    expect(parseAddressValidationResult({
      action: "allow",
      addressValid: true,
      addressPresent: true,
      abuse: false,
      testOrFake: false,
      vague: false,
      riskScore: 12,
      reason: "Specific enough",
    })).toEqual({
      action: "allow",
      addressValid: true,
      addressPresent: true,
      abuse: false,
      testOrFake: false,
      vague: false,
      riskScore: 12,
      reason: "Specific enough",
    });
    expect(() => parseAddressValidationResult({ riskScore: "12" })).toThrow();
    expect(() => parseAddressValidationResult(null)).toThrow();
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
