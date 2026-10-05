// Shape of GET /api/home/summary (server/index.js, "Home" section).

export interface HomeMetric {
  value: number;
  previous: number;
  /** Percent change against the same time yesterday; null without a baseline. */
  change: number | null;
  /** Per-hour values for today, midnight to the current hour (Dhaka). */
  series: number[] | null;
}

export interface HomeLiveVisitor {
  city: string | null;
  country: string | null;
  path: string | null;
  last_seen_at: string;
  latitude: number;
  longitude: number;
}

export type HomeTagTone = "ok" | "warn" | "risk";

export interface HomeOrderRow {
  title: string;
  detail: string;
  tag: { label: string; tone: HomeTagTone };
}

export interface HomeChatRow {
  source: string | null;
  name: string;
  text: string;
}

export type HomePreview =
  | { type: "orders"; rows: HomeOrderRow[] }
  | { type: "chat"; rows: HomeChatRow[] }
  | { type: "bars"; rows: { label: string; value: number }[] }
  | { type: "places"; rows: { city: string; count: number }[] };

export interface HomeLink {
  label: string;
  to: string;
  state?: Record<string, unknown>;
}

export interface HomeAttentionCard {
  kind: string;
  count: number | null;
  title: string;
  body: string;
  cta: HomeLink;
  preview: HomePreview | null;
}

export interface HomeQuickAction {
  key: string;
  label: string;
  count: number | null;
  to: string;
  state?: Record<string, unknown>;
  tone?: "warn";
}

export interface HomeSummary {
  generated_at: string;
  /** The reported period; compared_with is null for all time. */
  range?: { since: string | null; until: string; compared_with: { since: string; until: string } | null };
  channel?: string;
  metrics: {
    sessions: HomeMetric | null;
    sales: HomeMetric | null;
    orders: HomeMetric | null;
    conversion_rate: HomeMetric | null;
  };
  live: { count: number | null; visitors: HomeLiveVisitor[] };
  quick_actions: HomeQuickAction[];
  attention: HomeAttentionCard[];
}
