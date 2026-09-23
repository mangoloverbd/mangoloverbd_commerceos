import { buildRiskContext } from "./context.js";
import { recordIdentityLinks } from "./links.js";

// Abandoned checkout is evidence of a browser-phone association, not a placed
// order. A missing signature or infrastructure issue never breaks capture.
export async function recordAbandonedRiskLinks({ orgId, capture, clientContext, secret, redis, record = recordIdentityLinks }) {
  if (!clientContext || !capture?.phone || !redis || !secret) return;
  try {
    const ctx = buildRiskContext({ orgId, route: "public_v1", body: { phone: capture.phone, items: [] }, clientContext, contextTrusted: true, secret });
    await record(redis, ctx, { countAttempt: false });
  } catch { console.warn("[OrderRisk] abandoned identity link unavailable"); }
}
