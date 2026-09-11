import { describe, expect, it } from "vitest";
import {
  AbandonedCheckoutValidationError,
  buildCaptureInsertRow,
  buildCaptureUpdatePatch,
  buildExpiryPatch,
  buildPersonalDataScrubPatch,
  buildStaffActionPatch,
  canAcceptBrowserCapture,
  canTransitionAbandonedCheckout,
  hashAbandonedCheckoutDraftKey,
  normalizeAbandonedCheckoutConvertOverrides,
  parseAbandonedCheckoutCapture,
  parseAbandonedCheckoutStaffEdit,
} from "../../server/abandonedCheckouts.js";

const draftKey = "7cb13b8e-b576-4faa-b238-cc8b73059772";

const validCapture = {
  draftKey,
  source: "storefront",
  sourcePath: "/checkout",
  customerName: "  Farzana Akter  ",
  phone: "+880 1712-345678",
  address: "House 1, Road 2, Dhaka",
  items: [{
    productName: "Sundarbans Honey",
    variantName: "1 kg",
    quantity: 2,
    unitPrice: 750,
  }],
  subtotal: 1500,
  deliveryRate: 100,
  total: 1600,
  campaign: {
    utmSource: "facebook",
    utmCampaign: "september-honey",
  },
};

describe("abandoned checkout capture parsing", () => {
  it("normalizes a valid bounded capture without accepting a browser workspace", () => {
    expect(parseAbandonedCheckoutCapture(validCapture)).toEqual({
      draftKey,
      source: "storefront",
      sourcePath: "/checkout",
      customerName: "Farzana Akter",
      phone: "01712345678",
      address: "House 1, Road 2, Dhaka",
      cart: [{
        productName: "Sundarbans Honey",
        variantName: "1 kg",
        quantity: 2,
        unitPrice: 750,
      }],
      subtotal: 1500,
      deliveryRate: 100,
      total: 1600,
      campaign: {
        utmSource: "facebook",
        utmCampaign: "september-honey",
      },
    });
  });

  it("rejects unknown fields, source-path mismatches, and unsafe cart values", () => {
    const invalidCaptures = [
      { ...validCapture, orgId: "visitor-controlled" },
      { ...validCapture, sourcePath: "/step/honey-nut" },
      { ...validCapture, phone: "0181234567" },
      { ...validCapture, items: [] },
      { ...validCapture, items: [{ ...validCapture.items[0], quantity: 0 }] },
      { ...validCapture, total: -1 },
      { ...validCapture, campaign: { utmSource: "facebook", unknown: "nope" } },
    ];

    for (const capture of invalidCaptures) {
      expect(() => parseAbandonedCheckoutCapture(capture)).toThrow(AbandonedCheckoutValidationError);
    }
  });

  it("canonicalizes the opaque UUID before deriving the server-side order reconciliation hash", () => {
    const uppercaseKey = "7CB13B8E-B576-4FAA-B238-CC8B73059772";

    expect(parseAbandonedCheckoutCapture({ ...validCapture, draftKey: uppercaseKey }).draftKey).toBe(draftKey);
    expect(hashAbandonedCheckoutDraftKey(uppercaseKey)).toBe(
      "09e165809f6f25388a6d11963605408bde4f2ae60f785cd305a1b97be7747da1",
    );
  });
});

describe("abandoned checkout lifecycle", () => {
  const now = new Date("2026-09-11T12:00:00.000Z");
  const future = "2026-09-12T12:00:00.000Z";

  it("keeps contacted drafts updatable but never reopens terminal drafts", () => {
    expect(canAcceptBrowserCapture({ status: "open", expiresAt: future }, now)).toBe(true);
    expect(canAcceptBrowserCapture({ status: "contacted", expiresAt: future }, now)).toBe(true);
    expect(canAcceptBrowserCapture({ status: "dismissed", expiresAt: future }, now)).toBe(false);
    expect(canAcceptBrowserCapture({ status: "recovered", expiresAt: future }, now)).toBe(false);
    expect(canAcceptBrowserCapture({ status: "expired", expiresAt: future }, now)).toBe(false);
    expect(canAcceptBrowserCapture({ status: "open", expiresAt: "2026-09-11T11:59:59.000Z" }, now)).toBe(false);
  });

  it("allows only manual contacted and dismissal transitions", () => {
    expect(canTransitionAbandonedCheckout("open", "contacted", "staff")).toBe(true);
    expect(canTransitionAbandonedCheckout("open", "dismissed", "staff")).toBe(true);
    expect(canTransitionAbandonedCheckout("contacted", "dismissed", "staff")).toBe(true);
    expect(canTransitionAbandonedCheckout("contacted", "open", "staff")).toBe(false);
    expect(canTransitionAbandonedCheckout("dismissed", "contacted", "staff")).toBe(false);
    expect(canTransitionAbandonedCheckout("open", "recovered", "staff")).toBe(false);
  });

  it("scrubs a due draft's personal and cart data while retaining terminal audit state", () => {
    expect(buildExpiryPatch(now)).toEqual({
      status: "expired",
      customer_name: null,
      phone: null,
      address: null,
      cart: [],
      campaign: {},
      subtotal: null,
      delivery_rate: null,
      total: null,
      resolved_at: "2026-09-11T12:00:00.000Z",
      resolution: "expired",
    });
  });

  it("scrubs expired terminal drafts without overwriting their recovery or dismissal audit state", () => {
    expect(buildPersonalDataScrubPatch()).toEqual({
      customer_name: null,
      phone: null,
      address: null,
      cart: [],
      campaign: {},
      subtotal: null,
      delivery_rate: null,
      total: null,
    });
  });

  it("builds a fixed-expiry scoped insert row without a client-selected workspace", () => {
    const capture = parseAbandonedCheckoutCapture(validCapture);
    const row = buildCaptureInsertRow("00000000-0000-4000-8000-000000000001", capture, now);

    expect(row).toMatchObject({
      org_id: "00000000-0000-4000-8000-000000000001",
      draft_key: draftKey,
      status: "open",
      phone: "01712345678",
      source: "storefront",
      source_path: "/checkout",
      expires_at: "2026-10-11T12:00:00.000Z",
    });
    expect(row).not.toHaveProperty("orgId");
  });

  it("updates captured details without extending expiry or reopening a contacted draft", () => {
    const patch = buildCaptureUpdatePatch(parseAbandonedCheckoutCapture(validCapture));

    expect(patch).toMatchObject({
      customer_name: "Farzana Akter",
      phone: "01712345678",
      cart: [{ productName: "Sundarbans Honey", variantName: "1 kg", quantity: 2, unitPrice: 750 }],
      delivery_rate: 100,
    });
    expect(patch).not.toHaveProperty("status");
    expect(patch).not.toHaveProperty("expires_at");
  });

  it("builds only the permitted staff state patches", () => {
    expect(buildStaffActionPatch("open", "contacted", now)).toEqual({
      status: "contacted",
      contacted_at: "2026-09-11T12:00:00.000Z",
    });
    expect(buildStaffActionPatch("contacted", "dismissed", now)).toEqual({
      status: "dismissed",
      resolved_at: "2026-09-11T12:00:00.000Z",
      resolution: "dismissed",
    });
    expect(buildStaffActionPatch("dismissed", "contacted", now)).toBeNull();
  });
});

const validEdit = {
  customerName: "Farzana Akter",
  phone: "+880 1712-345678",
  address: "House 1, Road 2, Dhaka",
  items: [{ productName: "Sundarbans Honey", variantName: "1 kg", quantity: 2, unitPrice: 750 }],
  deliveryRate: 100,
};

describe("abandoned checkout staff edit parsing", () => {
  it("normalizes contact fields and recomputes totals from items", () => {
    expect(parseAbandonedCheckoutStaffEdit(validEdit)).toEqual({
      customer_name: "Farzana Akter",
      phone: "01712345678",
      address: "House 1, Road 2, Dhaka",
      cart: [{ productName: "Sundarbans Honey", variantName: "1 kg", quantity: 2, unitPrice: 750 }],
      subtotal: 1500,
      delivery_rate: 100,
      total: 1600,
    });
  });

  it("rejects unknown keys, bad phones, empty carts, and out-of-range lines", () => {
    expect(() => parseAbandonedCheckoutStaffEdit({ ...validEdit, orgId: "x" }))
      .toThrow(AbandonedCheckoutValidationError);
    expect(() => parseAbandonedCheckoutStaffEdit({ ...validEdit, phone: "123" }))
      .toThrow(AbandonedCheckoutValidationError);
    expect(() => parseAbandonedCheckoutStaffEdit({ ...validEdit, items: [] }))
      .toThrow(AbandonedCheckoutValidationError);
    expect(() => parseAbandonedCheckoutStaffEdit({
      ...validEdit,
      items: [{ productName: "Honey", variantName: null, quantity: 0, unitPrice: 750 }],
    })).toThrow(AbandonedCheckoutValidationError);
    expect(() => parseAbandonedCheckoutStaffEdit({
      ...validEdit,
      items: [{ productName: "Honey", variantName: null, quantity: 1, unitPrice: -5 }],
    })).toThrow(AbandonedCheckoutValidationError);
  });
});

describe("abandoned checkout convert override normalization", () => {
  it("trims overrides within the capture bounds", () => {
    expect(normalizeAbandonedCheckoutConvertOverrides("  Rahim Uddin  ", " House 1, Dhaka "))
      .toEqual({ customerName: "Rahim Uddin", address: "House 1, Dhaka" });
  });

  it("falls back to the draft when overrides are missing or blank", () => {
    expect(normalizeAbandonedCheckoutConvertOverrides(undefined, undefined))
      .toEqual({ customerName: null, address: null });
    expect(normalizeAbandonedCheckoutConvertOverrides("   ", ""))
      .toEqual({ customerName: null, address: null });
  });

  it("rejects overlong or non-string overrides like capture validation", () => {
    expect(() => normalizeAbandonedCheckoutConvertOverrides("n".repeat(121), "Dhaka"))
      .toThrow(AbandonedCheckoutValidationError);
    expect(() => normalizeAbandonedCheckoutConvertOverrides("Rahim", "a".repeat(501)))
      .toThrow(AbandonedCheckoutValidationError);
    expect(() => normalizeAbandonedCheckoutConvertOverrides(42, "Dhaka"))
      .toThrow(AbandonedCheckoutValidationError);
  });
});
