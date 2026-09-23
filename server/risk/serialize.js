const rank = { critical: 0, high: 1, medium: 2, low: 3, trust: 4 };
const sortSignals = signals => [...(Array.isArray(signals) ? signals : [])].sort((a, b) => (rank[a.severity] ?? 5) - (rank[b.severity] ?? 5));
const short = (value, length) => typeof value === "string" ? value.slice(0, length) : null;

export function toAttemptSummary(row) {
  const { id, created_at, decision, score, mode, customer_name, phone, parsed_district, total, order_id, review_id, label } = row;
  return { id, created_at, decision, score, mode, topSignals: sortSignals(row.signals).slice(0, 3), customer_name, phone, parsed_district, total, order_id, review_id, label };
}

export function toAttemptDetail(row) {
  const safe = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "org_id" && !key.endsWith("_hash")));
  return { ...safe, deviceShortId: short(row.device_hash, 8), networkShortId: short(row.network_hash, 8), fingerprintShortId: short(row.fingerprint_hash, 8) };
}

export function buildDisplayHint(kind, attempt) {
  if (kind === "phone") return typeof attempt.phone === "string" && attempt.phone.length >= 6
    ? `${attempt.phone.slice(0, 3)}•••••${attempt.phone.slice(-3)}` : null;
  if (kind === "device") return attempt.device_hash ? `Device ${short(attempt.device_hash, 6)}` : null;
  if (kind === "fingerprint") return attempt.fingerprint_hash ? `Browser ${short(attempt.fingerprint_hash, 6)}` : null;
  if (kind === "network") return attempt.ip_prefix ?? (attempt.network_hash ? `Network ${short(attempt.network_hash, 6)}` : null);
  return null;
}
