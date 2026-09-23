import { THRESHOLDS } from "./signals.js";

export function decideRisk({ signals, contextTrusted, dependencyUnavailable = false, engineError = false }) {
  if (!Array.isArray(signals)) throw new TypeError("Signals must be an array");
  const score = Math.max(0, signals.filter(signal => signal.severity !== "critical").reduce((sum, signal) => sum + signal.points, 0));
  const outcome = (decision, reasons) => ({ decision, score, signals, reasons });
  if (signals.some(signal => signal.code === "staff_allowlist")) return outcome("ALLOW", ["staff_allowlist"]);
  const critical = signals.find(signal => signal.severity === "critical");
  if (critical) return outcome("BLOCK", [`critical:${critical.code}`]);
  const highFamilies = new Set(signals.filter(signal => signal.severity === "high").map(signal => signal.family));
  if (score >= THRESHOLDS.blockScore && highFamilies.size >= THRESHOLDS.blockMinHighFamilies) {
    return outcome("BLOCK", ["score>=100", "independent_high_families"]);
  }
  const reasons = [];
  if (score >= THRESHOLDS.holdScore) reasons.push("score>=40");
  if (signals.some(signal => signal.family === "LOCATION") && !signals.some(signal => signal.code === "trusted_delivered_customer")) reasons.push("location");
  if (!contextTrusted) reasons.push("untrusted_context");
  if (dependencyUnavailable) reasons.push("dependency_unavailable");
  if (engineError) reasons.push("engine_error");
  return outcome(reasons.length ? "HOLD" : "ALLOW", reasons);
}
