// Which live-visitor tracker pings are worth sending to the analytics pipeline.
//
// The storefront tracker pings every 20 seconds to keep the Dashboard's live
// visitor count fresh. Those heartbeats only matter for Redis presence; reports
// need page views and explicit steps. Pings from scripts cached before `kind`
// existed carry no kind and are still forwarded so nothing is lost mid-rollout.

export const TRACKER_HIT_KINDS = Object.freeze(["pageview", "heartbeat", "step"]);

export function normalizeTrackerKind(value) {
  return TRACKER_HIT_KINDS.includes(value) ? value : null;
}

export function shouldForwardTrackerHit(kind) {
  return normalizeTrackerKind(kind) !== "heartbeat";
}
