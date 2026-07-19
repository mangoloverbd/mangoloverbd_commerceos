import { describe, expect, it } from "vitest";
import {
  HANDLE_REGEX,
  RESERVED_HANDLES,
  normalizeStorefrontHandle,
  validateStorefrontHandle,
} from "../../server/storefrontHandle.js";

describe("normalizeStorefrontHandle", () => {
  it("lowercases and trims", () => {
    expect(normalizeStorefrontHandle("  ArcLab  ")).toBe("arclab");
  });

  it("returns empty string for non-strings", () => {
    expect(normalizeStorefrontHandle(null as unknown as string)).toBe("");
    expect(normalizeStorefrontHandle(undefined as unknown as string)).toBe("");
    expect(normalizeStorefrontHandle(42 as unknown as string)).toBe("");
  });
});

describe("HANDLE_REGEX", () => {
  it("accepts valid handles", () => {
    for (const h of ["ab", "arclab", "arc-lab", "a1", "abc-123-xyz", "a".repeat(50)]) {
      expect(HANDLE_REGEX.test(h), `should accept ${h}`).toBe(true);
    }
  });

  it("rejects invalid formats", () => {
    for (const h of [
      "a",
      "-arclab",
      "arclab-",
      "Arc",
      "arc_lab",
      "arc lab",
      "arc.lab",
      "a".repeat(51),
    ]) {
      expect(HANDLE_REGEX.test(h), `should reject ${h}`).toBe(false);
    }
  });
});

describe("RESERVED_HANDLES", () => {
  it("reserves future API siblings under /api/public/v1/", () => {
    for (const h of ["v1", "v2", "webhooks", "oauth", "graphql", "storefronts"]) {
      expect(RESERVED_HANDLES.has(h), `${h} must be reserved`).toBe(true);
    }
  });
});

describe("validateStorefrontHandle", () => {
  it("accepts a clean handle and returns the normalized form", () => {
    expect(validateStorefrontHandle("  ArcLab  ")).toEqual({ ok: true, handle: "arclab" });
  });

  it("rejects empty input", () => {
    expect(validateStorefrontHandle("")).toEqual({ ok: false, reason: "empty" });
    expect(validateStorefrontHandle("   ")).toEqual({ ok: false, reason: "empty" });
    expect(validateStorefrontHandle(null as unknown as string)).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects malformed handles with reason: format", () => {
    for (const h of ["a", "-arclab", "arclab-", "arc_lab", "a".repeat(51)]) {
      expect(validateStorefrontHandle(h)).toEqual({ ok: false, reason: "format" });
    }
  });

  it("rejects reserved handles with reason: reserved", () => {
    for (const h of ["v1", "storefronts", "webhooks", "admin"]) {
      expect(validateStorefrontHandle(h)).toEqual({ ok: false, reason: "reserved" });
    }
  });

  it("case-folds reserved words before rejecting", () => {
    expect(validateStorefrontHandle("V1")).toEqual({ ok: false, reason: "reserved" });
    expect(validateStorefrontHandle("Storefronts")).toEqual({ ok: false, reason: "reserved" });
  });
});
