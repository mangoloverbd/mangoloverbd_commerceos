import { describe, expect, test, vi } from "vitest";

import { verifyTurnstileToken } from "../../server/turnstile.js";
import {
  buildSubmissionFingerprint,
  hashProtectionSignal,
  recordProtectionEvent,
} from "../../server/orderProtectionStore.js";

describe("order protection storage adapters", () => {
  test("verifies a Turnstile token without exposing the secret in the request result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ success: true }),
    });

    const result = await verifyTurnstileToken({
      token: "turnstile-token",
      remoteIp: "203.0.113.5",
      secret: "turnstile-secret",
      fetchImpl,
    });

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).not.toHaveProperty("secret");
  });

  test("maps a Turnstile network failure to an unavailable result", async () => {
    const result = await verifyTurnstileToken({
      token: "turnstile-token",
      secret: "turnstile-secret",
      fetchImpl: vi.fn().mockRejectedValue(new Error("network down")),
    });

    expect(result).toEqual({ ok: false, unavailable: true });
  });

  test("creates stable keyed hashes and fingerprints", () => {
    const input = {
      orgId: "org-1",
      phone: "01712345678",
      address: "House 1, Dhaka",
      items: [{ productId: "p-1", variantId: "v-1", quantity: 1 }],
    };

    expect(hashProtectionSignal("01712345678", "test-secret-123456")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashProtectionSignal("01712345678", "test-secret-123456")).toBe(hashProtectionSignal("01712345678", "test-secret-123456"));
    expect(buildSubmissionFingerprint(input, "test-secret-123456")).toBe(buildSubmissionFingerprint(input, "test-secret-123456"));
    expect(buildSubmissionFingerprint(input, "test-secret-123456")).not.toContain("01712345678");
    expect(buildSubmissionFingerprint(input, "test-secret-123456")).not.toContain("House 1, Dhaka");
  });

  test("persists only scrubbed event fields", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ insert }) };

    await recordProtectionEvent({
      supabase,
      secret: "test-secret-123456",
      event: {
        orgId: "org-1",
        phone: "01712345678",
        address: "House 1, Dhaka",
        clientSessionId: "session-1",
        ip: "203.0.113.5",
        userAgent: "browser",
        decision: "BLOCK",
        score: 100,
        reasonCodes: ["honeypot_filled"],
        route: "public_v1",
      },
    });

    const payload = insert.mock.calls[0][0];
    expect(JSON.stringify(payload)).not.toContain("01712345678");
    expect(JSON.stringify(payload)).not.toContain("House 1, Dhaka");
    expect(JSON.stringify(payload)).not.toContain("203.0.113.5");
    expect(payload).toMatchObject({
      org_id: "org-1",
      decision: "BLOCK",
      score: 100,
      reason_codes: ["honeypot_filled"],
      phone_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      session_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      ip_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
});
