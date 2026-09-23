import {
  evaluateProtection,
  normalizeProtectionInput,
  serializeProtectionResponse,
} from "./orderSubmissionProtection.js";
import {
  buildSubmissionFingerprint,
  countRecentPhoneSignals,
  createProtectionReview,
  hashProtectionSignal,
  recordPhoneSignal,
  recordProtectionEvent,
  reserveSubmissionFingerprint,
} from "./orderProtectionStore.js";
import { verifyTurnstileToken } from "./turnstile.js";
import { resolveProtectionMode } from "./risk/mode.js";

function getProtectionSecret(dependencies) {
  return dependencies.secret || process.env.ORDER_PROTECTION_HASH_SECRET || null;
}

function getClientNetwork(input, requestMeta) {
  return requestMeta.network || requestMeta.ip || "unknown";
}

function buildEvent(input, requestMeta, protection, reviewId = null, mode) {
  return {
    orgId: input.orgId,
    phone: input.phone,
    clientSessionId: input.clientSessionId,
    ip: requestMeta.ip,
    network: getClientNetwork(input, requestMeta),
    userAgent: requestMeta.userAgent,
    decision: protection.decision,
    mode,
    score: protection.score,
    reasonCodes: protection.reasonCodes,
    route: input.route,
    reviewId,
  };
}

export async function protectOrderSubmission({ input: rawInput, requestMeta = {}, dependencies = {}, mode = resolveProtectionMode({ envMode: process.env.ORDER_PROTECTION_MODE }) }) {
  if (mode === "off") {
    return {
      protection: {
        decision: "ALLOW",
        score: 0,
        reasonCodes: [],
        customerMessage: "Order details accepted.",
        retryable: false,
      },
      response: { decision: "allow" },
      fingerprint: null,
    };
  }

  const input = normalizeProtectionInput(rawInput);
  const secret = getProtectionSecret(dependencies);
  if (!secret) {
    return {
      protection: {
        decision: "BLOCK",
        score: 100,
        reasonCodes: ["rate_limit_exceeded"],
        customerMessage: "Order protection is temporarily unavailable. Please try again shortly.",
        retryable: true,
      },
      response: { decision: "block", error: "protection_unavailable", retryable: true },
      fingerprint: null,
    };
  }
  const phoneHash = hashProtectionSignal(input.phone, secret);
  const fingerprint = buildSubmissionFingerprint(input, secret);
  const redis = dependencies.redis;

  const counts = typeof dependencies.countPhoneAttempts === "function"
    ? null
    : await countRecentPhoneSignals({ redis, orgId: input.orgId, phoneHash });
  if (counts?.unavailable) {
    return {
      protection: {
        decision: "BLOCK",
        score: 100,
        reasonCodes: ["rate_limit_exceeded"],
        customerMessage: "Order protection is temporarily unavailable. Please try again shortly.",
        retryable: true,
      },
      response: { decision: "block", error: "protection_unavailable", retryable: true },
      fingerprint,
    };
  }

  const evaluatedProtection = await evaluateProtection(input, {
    countPhoneAttempts: dependencies.countPhoneAttempts
      || (async () => counts?.attempts || { last15m: 0, last1h: 0, last24h: 0 }),
    countPhoneSessions: dependencies.countPhoneSessions
      || (async () => counts?.sessions || 0),
    countPhoneNetworks: dependencies.countPhoneNetworks
      || (async () => counts?.networks || 0),
    isDuplicate: dependencies.isDuplicate || (async () => {
      if (!redis || typeof redis.exists !== "function") return false;
      return Number(await redis.exists(`op:duplicate:${fingerprint}`)) > 0;
    }),
    validateTurnstile: dependencies.verifyTurnstile || (async (normalizedInput) => verifyTurnstileToken({
      token: normalizedInput.turnstileToken,
      remoteIp: requestMeta.ip,
      secret: process.env.TURNSTILE_SECRET_KEY,
    })),
    validateAddress: dependencies.validateAddress,
  });

  if (typeof dependencies.recordPhoneSignal === "function") {
    await dependencies.recordPhoneSignal({ input, phoneHash, requestMeta });
  } else if (redis && input.phone) {
    await recordPhoneSignal({
      redis,
      orgId: input.orgId,
      phoneHash,
      sessionHash: input.clientSessionId ? hashProtectionSignal(input.clientSessionId, secret) : null,
      networkHash: hashProtectionSignal(getClientNetwork(input, requestMeta), secret),
    });
  }

  let protection = evaluatedProtection;
  let review = null;
  const shouldReserve = mode === "active" && (protection.decision === "ALLOW" || protection.decision === "REVIEW");
  if (shouldReserve) {
    const reservation = typeof dependencies.reserveFingerprint === "function"
      ? await dependencies.reserveFingerprint({ fingerprint })
      : await reserveSubmissionFingerprint({ redis, fingerprint });
    if (!reservation.reserved) {
      protection = {
        ...protection,
        decision: "BLOCK",
        score: 100,
        reasonCodes: [...protection.reasonCodes, "duplicate_submission"],
        customerMessage: "We could not accept this order. Please check your details and try again.",
      };
    }
  }

  if (mode === "active" && protection.decision === "REVIEW") {
    const reviewInput = {
      orgId: input.orgId,
      route: input.route,
      customerName: input.customerName,
      phone: input.phone,
      address: input.address,
      items: input.items,
      shippingZoneId: rawInput.shippingZoneId,
      notes: input.notes,
      score: protection.score,
      reasonCodes: protection.reasonCodes,
    };
    review = typeof dependencies.createReview === "function"
      ? await dependencies.createReview(reviewInput)
      : await createProtectionReview({ supabase: dependencies.supabase, review: reviewInput });
  }

  if (typeof dependencies.recordEvent === "function") {
    await dependencies.recordEvent(buildEvent(input, requestMeta, protection, review?.id || null, mode));
  } else if (dependencies.supabase) {
    await recordProtectionEvent({
      supabase: dependencies.supabase,
      secret,
      event: buildEvent(input, requestMeta, protection, review?.id || null, mode),
    });
  }

  if (mode === "shadow") {
    const allowed = { decision: "ALLOW", score: 0, reasonCodes: [], customerMessage: "Order details accepted.", retryable: false };
    return { protection: allowed, response: { decision: "allow" }, review: null, fingerprint };
  }

  const response = serializeProtectionResponse(protection);
  if (review?.id) response.reviewId = review.id;
  return { protection, response, review, fingerprint };
}
