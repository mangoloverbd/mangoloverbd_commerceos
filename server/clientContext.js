import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const CLIENT_CONTEXT_HEADER = "x-mlbd-client-context";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasKeys = (value, required) => isObject(value)
  && Object.keys(value).length === required.length
  && required.every((key) => Object.hasOwn(value, key));
const isIso = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value))
  && new Date(value).toISOString() === value;
const nullable = (value, predicate) => value === null || predicate(value);

function validContext(context) {
  return hasKeys(context, ["v", "issuedAt", "ip", "userAgent", "geo", "deviceId", "fingerprint", "telemetry"])
    && context.v === 1 && isIso(context.issuedAt) && typeof context.ip === "string" && isIP(context.ip) !== 0
    && nullable(context.userAgent, (value) => typeof value === "string" && value.length <= 400)
    && hasKeys(context.geo, ["country", "region", "city"])
    && [context.geo.country, context.geo.region, context.geo.city].every((value) => nullable(value, (text) => typeof text === "string" && text.length <= 80))
    && nullable(context.deviceId, (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    && nullable(context.fingerprint, (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value))
    && hasKeys(context.telemetry, ["firstInteractionAt", "phoneCandidates", "pastedFields"])
    && nullable(context.telemetry.firstInteractionAt, isIso)
    && Array.isArray(context.telemetry.phoneCandidates) && context.telemetry.phoneCandidates.length <= 5
    && context.telemetry.phoneCandidates.every((value) => typeof value === "string" && /^\d{11}$/.test(value))
    && new Set(context.telemetry.phoneCandidates).size === context.telemetry.phoneCandidates.length
    && Array.isArray(context.telemetry.pastedFields) && context.telemetry.pastedFields.length <= 3
    && context.telemetry.pastedFields.every((value) => ["name", "phone", "address"].includes(value))
    && new Set(context.telemetry.pastedFields).size === context.telemetry.pastedFields.length;
}

export function signClientContext(context, secret) {
  const payload = Buffer.from(JSON.stringify(context)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

export function verifyClientContext(headerValue, { secret, now = Date.now(), maxAgeMs = 60_000 } = {}) {
  if (typeof secret !== "string" || secret.length < 32) return { ok: false, reason: "unconfigured" };
  if (headerValue === undefined || headerValue === null || headerValue === "") return { ok: false, reason: "missing" };
  if (typeof headerValue !== "string" || headerValue.length > 4096 || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(headerValue)) {
    return { ok: false, reason: "malformed" };
  }
  const [payload, signature] = headerValue.split(".");
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (!timingSafeEqual(Buffer.from(signature, "hex"), expected)) return { ok: false, reason: "bad_signature" };
  let context;
  try {
    const bytes = Buffer.from(payload, "base64url");
    if (bytes.toString("base64url") !== payload) return { ok: false, reason: "malformed" };
    context = JSON.parse(bytes.toString("utf8"));
  } catch { return { ok: false, reason: "malformed" }; }
  if (!validContext(context)) return { ok: false, reason: "invalid" };
  const age = now - Date.parse(context.issuedAt);
  if (age > maxAgeMs) return { ok: false, reason: "expired" };
  if (age < -5_000) return { ok: false, reason: "invalid" };
  return { ok: true, context };
}
