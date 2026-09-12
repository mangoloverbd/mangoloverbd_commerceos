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
  "abusive_content",
  "test_or_fake_content",
  "address_validation_unavailable",
];

export const ORDER_PROTECTION_DECISIONS = Object.freeze([...decisionValues]);
export const ORDER_PROTECTION_REASON_CODES = Object.freeze([...reasonCodeValues]);

export const ORDER_PROTECTION_THRESHOLDS = Object.freeze({
  reviewScore: 40,
  checkoutTooFastSeconds: 8,
  phoneAttempts15m: 3,
  phoneAttempts1h: 5,
  phoneAttempts24h: 8,
  phoneSessionCount: 3,
  phoneNetworkCount: 2,
  aiHardBlockRiskScore: 60,
  reviewTtlDays: 30,
});

