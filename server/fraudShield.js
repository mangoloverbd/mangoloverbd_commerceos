// FraudShield client and cache policy. All I/O is injected so this module
// stays unit-testable and free of a Supabase or network import, matching the
// pattern in server/storefrontSeoRefresh.js.

import { normalizeBdPhone } from "./abandonedCheckouts.js";

export const FRAUD_CACHE_TTL_DAYS = 30;
export const FRAUD_ERROR_RETRY_HOURS = 1;
export const FRAUD_QUOTA_RESERVE = 100;
export const FRAUD_PENDING_CLAIM_SECONDS = 60;

const FRAUDSHIELD_CHECK_URL = "https://fraudshield.bd/api/customer/check";

export function parseFraudShieldError(status, body) {
  let message = body;
  try {
    const parsed = JSON.parse(body);
    message = parsed.message || parsed.error || parsed.details || body;
  } catch {
    // FraudShield sometimes returns plain text/HTML on upstream failures.
  }

  if (status === 502) {
    return "FraudShield server returned a 502 Bad Gateway. This usually indicates their origin database or upstream courier sync service is down.";
  }
  if (status === 504) {
    return "FraudShield server returned a 504 Gateway Timeout. The request timed out while querying courier records.";
  }
  if (status === 429) {
    return "Daily FraudShield limit reached. Checks resume after the limit resets.";
  }

  if (/BdCourierService|transformApiResponse|null returned/i.test(message)) {
    return "FraudShield is temporarily failing while reading BD Courier data. Please try again later or contact FraudShield support if it continues.";
  }

  const hint =
    status === 401 || status === 403
      ? "Invalid or expired API key"
      : `HTTP ${status}`;
  return `${hint}: ${String(message).substring(0, 200) || "(no body)"}`;
}

// Legacy summary shape. OrdersTable.FraudCell and server/ai-actions.js read
// this exact object out of orders.fraud_data — do not rename its keys.
export function deriveFraudSummary(payload, cleanedPhone) {
  // `summary` is FraudShield's own aggregate across couriers, not a courier.
  // The previous implementation counted it as one, doubling every total.
  const courierEntries = Object.entries(payload?.courierData || {})
    .filter(([key]) => key !== "summary");

  let totalParcels = 0;
  let totalDelivered = 0;
  let totalCancelled = 0;
  const apis = {};

  for (const [key, c] of courierEntries) {
    const total = c.total_parcel ?? c.total ?? 0;
    const delivered = c.success_parcel ?? c.successful ?? 0;
    const cancelled = c.cancelled_parcel ?? c.cancelled ?? 0;
    totalParcels += total;
    totalDelivered += delivered;
    totalCancelled += cancelled;
    apis[c.name ?? key] = {
      total_parcels: total,
      total_delivered_parcels: delivered,
      total_cancelled_parcels: cancelled,
    };
  }

  const successRate = totalParcels > 0
    ? Math.round((totalDelivered / totalParcels) * 100)
    : 0;

  const riskLevel =
    payload?.fraudRiskScore?.level ??
    (successRate >= 70 ? "low" : successRate >= 50 ? "medium" : "high");

  return {
    mobile_number: cleanedPhone,
    total_parcels: totalParcels,
    total_delivered: totalDelivered,
    total_cancel: totalCancelled,
    fraud_risk: riskLevel,
    success_rate: successRate,
    last_delivery: "",
    apis,
  };
}

// Caller must pass an already-normalized phone. Returns the full upstream body
// as `payload` plus the legacy `summary`, or an operator-readable message.
export async function fetchFraudShield(cleanedPhone, apiKey, fetchImpl = fetch) {
  const trimmedApiKey = String(apiKey || "").trim();
  if (!trimmedApiKey) {
    return { payload: null, summary: null, errorMessage: "No API key provided" };
  }

  try {
    const response = await fetchImpl(FRAUDSHIELD_CHECK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${trimmedApiKey}`,
        "X-API-Key": trimmedApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ phone: cleanedPhone }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[FraudShield] API returned error for ${cleanedPhone}: status ${response.status}`);
      return { payload: null, summary: null, errorMessage: parseFraudShieldError(response.status, errorBody) };
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      return {
        payload: null,
        summary: null,
        errorMessage: "FraudShield returned an invalid JSON response. Please try again later.",
      };
    }

    if (!payload?.courierData) {
      return {
        payload: null,
        summary: null,
        errorMessage: `Unexpected response: ${JSON.stringify(payload).substring(0, 200)}`,
      };
    }

    return { payload, summary: deriveFraudSummary(payload, cleanedPhone), errorMessage: null };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { payload: null, summary: null, errorMessage: `Network error: ${msg}` };
  }
}

// ─── Cache policy ───────────────────────────────────────────────────────────

export function cacheState(row, now) {
  if (!row) return "missing";

  const checkedAt = new Date(row.checked_at).getTime();
  if (!Number.isFinite(checkedAt)) return "stale";
  const ageMs = now.getTime() - checkedAt;

  if (row.status === "pending") {
    return ageMs < FRAUD_PENDING_CLAIM_SECONDS * 1000 ? "claimed" : "stale";
  }
  if (row.status === "error") {
    return ageMs < FRAUD_ERROR_RETRY_HOURS * 3_600_000 ? "fresh" : "stale";
  }
  return ageMs < FRAUD_CACHE_TTL_DAYS * 86_400_000 ? "fresh" : "stale";
}

// Claims the phone with a `pending` row before calling, so a concurrent cron
// run and an operator's click cannot both pay for the same lookup. A failed
// re-check keeps whatever good data was already cached.
export async function resolveFraudCheck({ readCache, writeCache, callApi, now, force = false }) {
  const existing = await readCache();
  const state = cacheState(existing, now);

  if (state === "claimed") {
    return { row: existing, spentRequest: false, skipped: "claimed" };
  }
  if (!force && state === "fresh") {
    return { row: existing, spentRequest: false, skipped: null };
  }

  await writeCache({ status: "pending", checked_at: now.toISOString() });

  const result = await callApi();
  const next = result.errorMessage
    ? {
        status: "error",
        // Preserve the last good result so a transient upstream failure does
        // not blank the panel.
        payload: existing?.status === "ok" ? existing.payload ?? null : null,
        summary: existing?.status === "ok" ? existing.summary ?? null : null,
        error_message: result.errorMessage,
        checked_at: now.toISOString(),
      }
    : {
        status: "ok",
        payload: result.payload,
        summary: result.summary,
        error_message: null,
        checked_at: now.toISOString(),
      };

  await writeCache(next);
  return { row: next, spentRequest: true, skipped: null };
}

// Automated warming fails closed: if remaining quota is unknown, do not drain.
// Interactive checks are unaffected — the operator asked for those.
export function shouldWarm(usage, reserve) {
  const remaining = usage?.remaining_today;
  return Number.isFinite(remaining) && remaining > reserve;
}

export function selectPhonesToWarm({ orders, cachedRows, now, limit }) {
  const freshPhones = new Set(
    (cachedRows || [])
      .filter((row) => cacheState(row, now) !== "stale" && cacheState(row, now) !== "missing")
      .map((row) => row.phone),
  );

  const selected = [];
  const seen = new Set();
  for (const order of orders || []) {
    const phone = normalizeBdPhone(order.phone);
    if (!phone || seen.has(phone) || freshPhones.has(phone)) continue;
    seen.add(phone);
    selected.push(phone);
    if (selected.length >= limit) break;
  }
  return selected;
}
