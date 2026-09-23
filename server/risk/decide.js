import { THRESHOLDS } from "./signals.js";

const VELOCITY_CODES = new Set(["phone_burst_15m", "device_burst_15m", "phone_velocity_24h"]);

export function decideRisk({ signals, contextTrusted, dependencyUnavailable = false, engineError = false }) {
  if (!Array.isArray(signals)) throw new TypeError("Signals must be an array");
  const score = Math.max(0, signals.filter(signal => signal.severity !== "critical").reduce((sum, signal) => sum + signal.points, 0));
  const outcome = (decision, reasons) => ({ decision, score, signals, reasons });
  if (signals.some(signal => signal.code === "staff_allowlist")) return outcome("ALLOW", ["staff_allowlist"]);
  const critical = signals.find(signal => signal.severity === "critical");
  if (critical) return outcome(critical.code.startsWith("blocklist_") ? "BLOCK" : "HOLD", [`critical:${critical.code}`]);
  // Repeat-attempt counters for the same shopper are one piece of evidence: a
  // customer retrying after an error must never reach BLOCK through them alone.
  const highFamilies = new Set(signals.filter(signal => signal.severity === "high" && !VELOCITY_CODES.has(signal.code))
    .map(signal => signal.family));
  const reasons = [];
  if (signals.some(signal => signal.code === "honeypot_filled")) reasons.push("honeypot_filled");
  // Scores and geography are fallible. Even corroborating signals get a human
  // decision rather than denying a real shopper; weak combinations pass.
  if (score >= THRESHOLDS.holdScore * 2) reasons.push("score>=80");
  if (signals.some(signal => signal.code === "phone_fake_history" || signal.code === "device_fake_history")) reasons.push("confirmed_fake_history");
  // Prank orders use vague addresses from numbers with no record. A proven
  // customer with a short address is never held for this alone.
  const trusted = signals.some(signal => signal.code === "trusted_delivered_customer" || signal.code === "trusted_device" || signal.code === "courier_strong_history");
  if (!trusted && signals.some(signal => signal.code === "address_incomplete")) reasons.push("incomplete_address_unknown");
  if (score >= THRESHOLDS.blockScore && highFamilies.size >= THRESHOLDS.blockMinHighFamilies) reasons.push("independent_high_families");
  // Missing telemetry or an unavailable dependency is not evidence about the
  // customer. Record it for diagnosis without making them wait for staff.
  if (!contextTrusted && reasons.length) reasons.push("untrusted_context");
  if (dependencyUnavailable && reasons.length) reasons.push("dependency_unavailable");
  if (engineError && reasons.length) reasons.push("engine_error");
  return outcome(reasons.length ? "HOLD" : "ALLOW", reasons);
}
