import crypto from "crypto";

export const ABANDONED_CHECKOUT_SOURCE_PATHS = Object.freeze({
  storefront: "/checkout",
  sundarbans_honey: "/step/sundarbans-natural-honey",
  kalojira_mixed: "/step/kalojira-mixed",
  honey_nut: "/step/honey-nut",
});

export const ACTIVE_ABANDONED_CHECKOUT_STATUSES = Object.freeze(["open", "contacted"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAPTURE_KEYS = new Set([
  "draftKey",
  "source",
  "sourcePath",
  "customerName",
  "phone",
  "address",
  "items",
  "subtotal",
  "deliveryRate",
  "total",
  "campaign",
]);
const ITEM_KEYS = new Set(["productName", "variantName", "quantity", "unitPrice"]);
const CAMPAIGN_KEYS = new Set(["utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm"]);
const MAX_CAPTURE_ITEMS = 20;
const MAX_MONEY = 10_000_000;

export class AbandonedCheckoutValidationError extends Error {
  constructor() {
    super("Invalid abandoned checkout capture");
    this.name = "AbandonedCheckoutValidationError";
    this.category = "invalid_capture";
  }
}

function invalidCapture() {
  throw new AbandonedCheckoutValidationError();
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, keys) {
  return Object.keys(value).every((key) => keys.has(key));
}

function requiredString(value, min, max) {
  if (typeof value !== "string") invalidCapture();
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) invalidCapture();
  return normalized;
}

function optionalString(value, max) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") invalidCapture();
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > max) invalidCapture();
  return normalized;
}

function boundedMoney(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_MONEY) {
    invalidCapture();
  }
  const normalized = Math.round(value * 100) / 100;
  if (normalized !== value) invalidCapture();
  return normalized;
}

function parseCampaign(value) {
  if (value === undefined) return {};
  if (!isRecord(value) || !hasOnlyKeys(value, CAMPAIGN_KEYS)) invalidCapture();

  const campaign = {};
  for (const key of CAMPAIGN_KEYS) {
    if (value[key] === undefined || value[key] === null) continue;
    const normalized = optionalString(value[key], 120);
    if (normalized) campaign[key] = normalized;
  }
  return campaign;
}

function parseCart(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CAPTURE_ITEMS) invalidCapture();

  return value.map((item) => {
    if (!isRecord(item) || !hasOnlyKeys(item, ITEM_KEYS)) invalidCapture();
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) invalidCapture();

    return {
      productName: requiredString(item.productName, 1, 200),
      variantName: optionalString(item.variantName, 160),
      quantity: item.quantity,
      unitPrice: boundedMoney(item.unitPrice),
    };
  });
}

export function normalizeBdPhone(phone) {
  let clean = String(phone || "").replace(/\D/g, "");
  if (clean.startsWith("880")) {
    const after = clean.slice(3);
    if (after.startsWith("01") && after.length === 11) clean = after;
    else if (after.startsWith("1") && after.length === 10) clean = `0${after}`;
  }
  if (clean.length !== 11 || !clean.startsWith("01")) return null;
  return clean;
}

export function isAbandonedCheckoutDraftKey(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

export function parseAbandonedCheckoutCapture(body) {
  if (!isRecord(body) || !hasOnlyKeys(body, CAPTURE_KEYS)) invalidCapture();

  const submittedDraftKey = requiredString(body.draftKey, 36, 36);
  if (!isAbandonedCheckoutDraftKey(submittedDraftKey)) invalidCapture();
  const draftKey = submittedDraftKey.toLowerCase();

  const source = requiredString(body.source, 1, 40);
  const sourcePath = requiredString(body.sourcePath, 1, 120);
  if (ABANDONED_CHECKOUT_SOURCE_PATHS[source] !== sourcePath) invalidCapture();

  const phone = normalizeBdPhone(body.phone);
  if (!phone) invalidCapture();

  const cart = parseCart(body.items);
  const subtotal = boundedMoney(body.subtotal);
  const deliveryRate = boundedMoney(body.deliveryRate);
  const total = boundedMoney(body.total);
  if (Math.abs(total - (subtotal + deliveryRate)) > 0.001) invalidCapture();

  return {
    draftKey,
    source,
    sourcePath,
    customerName: optionalString(body.customerName, 120),
    phone,
    address: optionalString(body.address, 500),
    cart,
    subtotal,
    deliveryRate,
    total,
    campaign: parseCampaign(body.campaign),
  };
}

export function hashAbandonedCheckoutDraftKey(draftKey) {
  if (!isAbandonedCheckoutDraftKey(draftKey)) return null;
  return crypto.createHash("sha256").update(draftKey.toLowerCase()).digest("hex");
}

export function canAcceptBrowserCapture({ status, expiresAt }, now = new Date()) {
  if (!ACTIVE_ABANDONED_CHECKOUT_STATUSES.includes(status)) return false;
  const expiresAtMs = Date.parse(expiresAt || "");
  return Number.isFinite(expiresAtMs) && expiresAtMs > now.getTime();
}

export function canTransitionAbandonedCheckout(from, to, actor = "staff") {
  if (actor === "staff") {
    return (from === "open" && (to === "contacted" || to === "dismissed"))
      || (from === "contacted" && (to === "dismissed" || to === "open"));
  }
  if (actor === "system") {
    return ACTIVE_ABANDONED_CHECKOUT_STATUSES.includes(from)
      && (to === "recovered" || to === "expired");
  }
  return false;
}

export function buildCaptureInsertRow(orgId, capture, now = new Date()) {
  const expiresAt = new Date(now.getTime());
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);

  return {
    org_id: orgId,
    draft_key: capture.draftKey,
    status: "open",
    customer_name: capture.customerName,
    phone: capture.phone,
    address: capture.address,
    cart: capture.cart,
    subtotal: capture.subtotal,
    delivery_rate: capture.deliveryRate,
    total: capture.total,
    source: capture.source,
    source_path: capture.sourcePath,
    campaign: capture.campaign,
    expires_at: expiresAt.toISOString(),
  };
}

export function buildCaptureUpdatePatch(capture) {
  return {
    customer_name: capture.customerName,
    phone: capture.phone,
    address: capture.address,
    cart: capture.cart,
    subtotal: capture.subtotal,
    delivery_rate: capture.deliveryRate,
    total: capture.total,
    source: capture.source,
    source_path: capture.sourcePath,
    campaign: capture.campaign,
  };
}

export function buildStaffActionPatch(status, action, now = new Date()) {
  if (!canTransitionAbandonedCheckout(status, action, "staff")) return null;
  if (action === "contacted") {
    return {
      status: "contacted",
      contacted_at: now.toISOString(),
    };
  }
  // Staff un-marking a mis-clicked "contacted"; clear the timestamp so the
  // checkout reads as never contacted rather than contacted-then-reverted.
  if (action === "open") {
    return {
      status: "open",
      contacted_at: null,
    };
  }
  return {
    status: "dismissed",
    resolved_at: now.toISOString(),
    resolution: "dismissed",
  };
}

export function buildPersonalDataScrubPatch() {
  return {
    customer_name: null,
    phone: null,
    address: null,
    cart: [],
    campaign: {},
    subtotal: null,
    delivery_rate: null,
    total: null,
  };
}

export function buildExpiryPatch(now = new Date()) {
  return {
    status: "expired",
    ...buildPersonalDataScrubPatch(),
    resolved_at: now.toISOString(),
    resolution: "expired",
  };
}

export function buildRecoveredPatch(now = new Date()) {
  return {
    status: "recovered",
    resolved_at: now.toISOString(),
    resolution: "ordered",
  };
}

const STAFF_EDIT_KEYS = new Set(["customerName", "phone", "address", "items", "deliveryRate"]);

export function parseAbandonedCheckoutStaffEdit(body) {
  if (!isRecord(body) || !hasOnlyKeys(body, STAFF_EDIT_KEYS)) invalidCapture();

  const phone = normalizeBdPhone(body.phone);
  if (!phone) invalidCapture();

  const cart = parseCart(body.items);
  const deliveryRate = boundedMoney(body.deliveryRate);
  const subtotal = Math.round(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) / 100;
  if (subtotal > MAX_MONEY) invalidCapture();

  return {
    customer_name: optionalString(body.customerName, 120),
    phone,
    address: optionalString(body.address, 500),
    cart,
    subtotal,
    delivery_rate: deliveryRate,
    total: Math.round((subtotal + deliveryRate) * 100) / 100,
  };
}

// Convert-dialog overrides share the capture bounds for contact fields
// (name max 120, address max 500). Blank or missing values normalize to null
// so the caller falls back to the draft; overlong or non-string values throw.
export function normalizeAbandonedCheckoutConvertOverrides(customerName, address) {
  return {
    customerName: optionalString(customerName, 120),
    address: optionalString(address, 500),
  };
}
