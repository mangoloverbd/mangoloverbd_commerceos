// Browser/server identity rules; SQL parity is verified by the migration tests.
export function normalizeCustomerPhone(phone) {
  let clean = String(phone || "").replace(/\D/g, "");
  if (clean.startsWith("880")) clean = `0${clean.slice(3)}`;
  if (clean.length === 10 && clean.startsWith("1")) clean = `0${clean}`;
  return /^01\d{9}$/.test(clean) ? clean : "";
}

export function parseInboxPhone(order) {
  const direct = normalizeCustomerPhone(order?.phone);
  if (direct) return direct;
  const match = String(order?.notes || "").match(/Phone:\s*([^\n,]+)/i);
  return normalizeCustomerPhone(match?.[1]);
}

export function customerKeyFor(row, kind = "order") {
  return (kind === "social" ? parseInboxPhone(row) : normalizeCustomerPhone(row?.phone))
    || `${kind}:${row?.id || row?.order_number || "unknown"}`;
}
