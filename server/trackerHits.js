// Which live-visitor tracker pings are worth sending to the analytics pipeline.
//
// The storefront tracker pings every 20 seconds to keep the Dashboard's live
// visitor count fresh. Those heartbeats only matter for Redis presence; reports
// need page views and explicit steps. Pings from scripts cached before `kind`
// existed carry no kind and are still forwarded so nothing is lost mid-rollout.

// engage: time a visitor spent on the page, flushed when they leave it.
export const TRACKER_HIT_KINDS = Object.freeze(["pageview", "heartbeat", "step", "engage"]);

export function normalizeTrackerKind(value) {
  return TRACKER_HIT_KINDS.includes(value) ? value : null;
}

export function shouldForwardTrackerHit(kind) {
  const normalized = normalizeTrackerKind(kind);
  return normalized !== "heartbeat" && normalized !== "engage";
}

// Engagement flushes can arrive after the tab is hidden; they must not mark
// the visitor as present on the site.
export function countsAsLivePresence(kind) {
  return normalizeTrackerKind(kind) !== "engage";
}
