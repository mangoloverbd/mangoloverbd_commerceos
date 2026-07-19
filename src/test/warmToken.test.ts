import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { isWarmRequest } from "../../server/warmToken.js";

const REAL_TOKEN = "super-secret-warm-token";

describe("isWarmRequest", () => {
  const prev = process.env.WARM_TOKEN;

  beforeEach(() => {
    process.env.WARM_TOKEN = REAL_TOKEN;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.WARM_TOKEN;
    else process.env.WARM_TOKEN = prev;
  });

  it("returns true for a correct X-Warm-Token", () => {
    const req = { headers: { "x-warm-token": REAL_TOKEN } };
    expect(isWarmRequest(req)).toBe(true);
  });

  it("returns false for a wrong token", () => {
    const req = { headers: { "x-warm-token": "not-the-token" } };
    expect(isWarmRequest(req)).toBe(false);
  });

  it("returns false when the header is missing", () => {
    const req = { headers: {} };
    expect(isWarmRequest(req)).toBe(false);
  });

  it("returns false when WARM_TOKEN is not configured", () => {
    delete process.env.WARM_TOKEN;
    const req = { headers: { "x-warm-token": REAL_TOKEN } };
    expect(isWarmRequest(req)).toBe(false);
  });

  it("returns false for a token of a different length", () => {
    const req = { headers: { "x-warm-token": REAL_TOKEN + "x" } };
    expect(isWarmRequest(req)).toBe(false);
  });
});
