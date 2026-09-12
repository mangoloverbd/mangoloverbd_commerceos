import { normalizeBdPhone } from "./abandonedCheckouts.js";

const decisionValues = ["ALLOW", "REVIEW", "BLOCK"];

const reasonCodeValues = [
  "honeypot_filled",
  "turnstile_failed",
  "rate_limit_exceeded",
  "phone_velocity_15m",
  "phone_velocity_1h",
  "phone_velocity_24h",
  "phone_many_sessions",
  "phone_network_change",
  "checkout_too_fast",
  "duplicate_submission",
  "address_missing",
  "address_too_short",
  "address_too_vague",
  "address_invalid",
  "abusive_content",
  "test_or_fake_content",
  "address_validation_unavailable",
];

export const ORDER_PROTECTION_DECISIONS = Object.freeze([...decisionValues]);
export const ORDER_PROTECTION_REASON_CODES = Object.freeze([...reasonCodeValues]);

export const ORDER_PROTECTION_THRESHOLDS = Object.freeze({
  reviewScore: 40,
  checkoutTooFastSeconds: 8,
  phoneAttempts15m: 2,
  phoneAttempts1h: 5,
  phoneAttempts24h: 8,
  phoneSessionCount: 3,
  phoneNetworkCount: 2,
  aiHardBlockRiskScore: 60,
  reviewTtlDays: 30,
});

const SCORE_WEIGHTS = Object.freeze({
  phoneVelocity15m: 25,
  phoneVelocity1h: 20,
  phoneVelocity24h: 20,
  phoneManySessions: 15,
  phoneNetworkChange: 10,
  checkoutTooFast: 10,
  addressVague: 10,
});

const ADDRESS_ACTIONS = new Set(["allow", "review", "block"]);
const MAX_STRING_LENGTHS = Object.freeze({
  orgId: 120,
  route: 40,
  customerName: 120,
  phone: 40,
  address: 500,
  notes: 500,
  website: 200,
  clientSessionId: 120,
  checkoutStartedAt: 60,
});

function boundedString(value, field) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new TypeError(`${field} must be a string`);
  const normalized = value.trim();
  if (normalized.length > MAX_STRING_LENGTHS[field]) {
    throw new RangeError(`${field} is too long`);
  }
  return normalized;
}

function uniqueReasonCodes(reasonCodes) {
  return [...new Set(reasonCodes)].filter((reasonCode) => reasonCodeValues.includes(reasonCode));
}

function genericMessage(decision) {
  if (decision === "REVIEW") return "Your order is being verified. We will contact you shortly.";
  if (decision === "BLOCK") return "We could not accept this order. Please check your details and try again.";
  return "Order details accepted.";
}

export function normalizeProtectionInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Protection input must be an object");
  }

  const value = input;
  const items = Array.isArray(value.items) ? value.items : [];
  const rawPhone = boundedString(value.phone, "phone");
  return {
    orgId: boundedString(value.orgId, "orgId"),
    route: boundedString(value.route, "route"),
    customerName: boundedString(value.customerName, "customerName"),
    phone: normalizeBdPhone(rawPhone) || rawPhone.replace(/\D/gu, ""),
    address: boundedString(value.address, "address"),
    notes: boundedString(value.notes, "notes"),
    website: boundedString(value.website, "website"),
    clientSessionId: boundedString(value.clientSessionId, "clientSessionId"),
    checkoutStartedAt: boundedString(value.checkoutStartedAt, "checkoutStartedAt"),
    turnstileToken: boundedString(value.turnstileToken, "turnstileToken"),
    items,
  };
}

function getElapsedSeconds(checkoutStartedAt, now = Date.now()) {
  if (!checkoutStartedAt) return null;
  const timestamp = Date.parse(checkoutStartedAt);
  if (!Number.isFinite(timestamp)) return null;
  const elapsed = (now - timestamp) / 1000;
  if (elapsed < 0 || elapsed > 24 * 60 * 60) return null;
  return elapsed;
}

function containsAbusiveContent(value) {
  return /(?:গালি|fuck|shit|bitch|সালা|হারামি|চুদ|মাদারচোদ|boka[\s_-]*choda|ban[\s_-]*chod|madar[\s_-]*chod|khankir[\s_-]*pola)/iu.test(value);
}

function containsTestContent(value) {
  return /(?:^|\s)(?:asdf+|qwer+|test(?:\s+order)?|fake(?:\s+order)?|dummy|sample)(?:\s|$)/iu.test(value)
    || /(.)\1{7,}/u.test(value.replace(/\s+/g, ""));
}

export function detectDeterministicSignals(input, { now = Date.now() } = {}) {
  const address = input.address.trim();
  const combinedText = [input.customerName, address, input.notes].filter(Boolean).join(" ");
  const wordCount = address.split(/\s+/u).filter(Boolean).length;
  const elapsedSeconds = getElapsedSeconds(input.checkoutStartedAt, now);
  const addressMissing = address.length === 0;
  const addressTooShort = !addressMissing && (address.length < 10 || wordCount < 3);
  const addressVague = !addressMissing
    && !addressTooShort
    && wordCount <= 6
    && !/\d/u.test(address)
    && /(?:near|beside|behind|market|বাসা|বাড়ি|বাড়ি|এলাকা|কাছাকাছি|মার্কেট)/iu.test(address);

  return {
    honeypotFilled: Boolean(input.website),
    addressMissing,
    addressTooShort,
    addressVague,
    abusiveContent: containsAbusiveContent(combinedText),
    testOrFakeContent: containsTestContent(combinedText),
    checkoutTooFast: elapsedSeconds !== null
      && elapsedSeconds < ORDER_PROTECTION_THRESHOLDS.checkoutTooFastSeconds,
    elapsedSeconds,
  };
}

export function calculateProtectionScore(signals) {
  const score = (signals.phoneVelocity15m ? SCORE_WEIGHTS.phoneVelocity15m : 0)
    + (signals.phoneVelocity1h ? SCORE_WEIGHTS.phoneVelocity1h : 0)
    + (signals.phoneVelocity24h ? SCORE_WEIGHTS.phoneVelocity24h : 0)
    + (signals.phoneManySessions ? SCORE_WEIGHTS.phoneManySessions : 0)
    + (signals.phoneNetworkChange ? SCORE_WEIGHTS.phoneNetworkChange : 0)
    + (signals.checkoutTooFast ? SCORE_WEIGHTS.checkoutTooFast : 0)
    + (signals.addressVague ? SCORE_WEIGHTS.addressVague : 0);
  return Math.min(100, score);
}

export function parseAddressValidationResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Address validation result must be an object");
  }
  if (!ADDRESS_ACTIONS.has(value.action)
    || typeof value.addressValid !== "boolean"
    || typeof value.addressPresent !== "boolean"
    || typeof value.abuse !== "boolean"
    || typeof value.testOrFake !== "boolean"
    || typeof value.vague !== "boolean"
    || !Number.isSafeInteger(value.riskScore)
    || value.riskScore < 0
    || value.riskScore > 100
    || typeof value.reason !== "string") {
    throw new TypeError("Malformed address validation result");
  }
  const reason = value.reason.trim();
  if (reason.length > 240) throw new RangeError("Address validation reason is too long");
  return {
    action: value.action,
    addressValid: value.addressValid,
    addressPresent: value.addressPresent,
    abuse: value.abuse,
    testOrFake: value.testOrFake,
    vague: value.vague,
    riskScore: value.riskScore,
    reason,
  };
}

function result(decision, score, reasonCodes, retryable = false) {
  return {
    decision,
    score,
    reasonCodes: uniqueReasonCodes(reasonCodes),
    customerMessage: genericMessage(decision),
    retryable,
  };
}

function countValue(value, field) {
  const count = Number(value?.[field] ?? 0);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

export async function evaluateProtection(rawInput, dependencies = {}) {
  const input = normalizeProtectionInput(rawInput);
  const signals = detectDeterministicSignals(input, dependencies);

  if (signals.honeypotFilled) return result("BLOCK", 100, ["honeypot_filled"]);
  if (signals.addressMissing) return result("BLOCK", 100, ["address_missing"]);
  if (signals.addressTooShort) return result("BLOCK", 100, ["address_too_short"]);
  const hardContentReasons = [];
  if (signals.abusiveContent) hardContentReasons.push("abusive_content");
  if (signals.testOrFakeContent) hardContentReasons.push("test_or_fake_content");
  if (hardContentReasons.length > 0) return result("BLOCK", 100, hardContentReasons);

  if (typeof dependencies.validateTurnstile === "function") {
    const turnstileResult = await dependencies.validateTurnstile(input);
    if (!turnstileResult?.ok) return result("BLOCK", 100, ["turnstile_failed"], Boolean(turnstileResult?.unavailable));
  }

  if (typeof dependencies.isDuplicate === "function" && await dependencies.isDuplicate(input)) {
    return result("BLOCK", 100, ["duplicate_submission"]);
  }

  const attempts = typeof dependencies.countPhoneAttempts === "function"
    ? await dependencies.countPhoneAttempts(input)
    : {};
  const phoneSessions = typeof dependencies.countPhoneSessions === "function"
    ? await dependencies.countPhoneSessions(input)
    : 0;
  const phoneNetworks = typeof dependencies.countPhoneNetworks === "function"
    ? await dependencies.countPhoneNetworks(input)
    : 0;

  const scoredSignals = {
    ...signals,
    // Redis counts prior submissions; include this submission when applying
    // total-attempt thresholds so the second request is the second attempt.
    phoneVelocity15m: countValue(attempts, "last15m") + 1 >= ORDER_PROTECTION_THRESHOLDS.phoneAttempts15m,
    phoneVelocity1h: countValue(attempts, "last1h") + 1 >= ORDER_PROTECTION_THRESHOLDS.phoneAttempts1h,
    phoneVelocity24h: countValue(attempts, "last24h") + 1 >= ORDER_PROTECTION_THRESHOLDS.phoneAttempts24h,
    phoneManySessions: Number(phoneSessions) >= ORDER_PROTECTION_THRESHOLDS.phoneSessionCount,
    phoneNetworkChange: Number(phoneNetworks) >= ORDER_PROTECTION_THRESHOLDS.phoneNetworkCount,
  };

  const reasonCodes = [];
  if (scoredSignals.phoneVelocity15m) reasonCodes.push("phone_velocity_15m");
  if (scoredSignals.phoneVelocity1h) reasonCodes.push("phone_velocity_1h");
  if (scoredSignals.phoneVelocity24h) reasonCodes.push("phone_velocity_24h");
  if (scoredSignals.phoneManySessions) reasonCodes.push("phone_many_sessions");
  if (scoredSignals.phoneNetworkChange) reasonCodes.push("phone_network_change");
  if (scoredSignals.checkoutTooFast) reasonCodes.push("checkout_too_fast");

  // Every otherwise eligible order receives the same server-side assessment.
  // Deterministic checks above still short-circuit obvious abuse and malformed input.
  if (typeof dependencies.validateAddress !== "function") {
    return result("BLOCK", 100, ["address_validation_unavailable"], true);
  }
  let addressResult;
  try {
    addressResult = parseAddressValidationResult(await dependencies.validateAddress(input));
  } catch {
    return result("BLOCK", 100, ["address_validation_unavailable"], true);
  }
  if (addressResult.abuse) reasonCodes.push("abusive_content");
  if (addressResult.testOrFake) reasonCodes.push("test_or_fake_content");
  if (!addressResult.addressPresent || !addressResult.addressValid) reasonCodes.push("address_invalid");
  if (addressResult.vague) reasonCodes.push("address_too_vague");
  if (addressResult.abuse || addressResult.testOrFake || !addressResult.addressPresent || !addressResult.addressValid) {
    return result("BLOCK", 100, reasonCodes);
  }

  const score = calculateProtectionScore({
    ...scoredSignals,
    addressVague: Boolean(addressResult.vague),
  });
  const aiRequestsReview = addressResult
    && (addressResult.action === "review" || addressResult.riskScore >= ORDER_PROTECTION_THRESHOLDS.reviewScore);
  if (addressResult.action === "block" || addressResult.riskScore >= ORDER_PROTECTION_THRESHOLDS.aiHardBlockRiskScore) {
    return result("BLOCK", 100, reasonCodes.length > 0 ? reasonCodes : ["address_invalid"]);
  }
  const phoneBurstRequestsReview = scoredSignals.phoneVelocity15m;
  return result(
    score >= ORDER_PROTECTION_THRESHOLDS.reviewScore || aiRequestsReview || phoneBurstRequestsReview
      ? "REVIEW"
      : "ALLOW",
    score,
    reasonCodes,
  );
}

export function serializeProtectionResponse(protectionResult) {
  return {
    decision: protectionResult.decision.toLowerCase(),
    score: protectionResult.score,
    reasonCodes: protectionResult.reasonCodes,
    customerMessage: protectionResult.customerMessage,
    retryable: protectionResult.retryable,
  };
}
