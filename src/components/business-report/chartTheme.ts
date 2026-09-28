export const CHART = {
  ink: "#0B0B0A",
  ink2: "rgba(11,11,10,0.62)",
  ink3: "rgba(11,11,10,0.42)",
  track: "rgba(11,11,10,0.08)",
  rule: "rgba(11,11,10,0.09)",
  bg: "#FAFAF8",
  greys: ["#0B0B0A", "#4A4A47", "#8A8A85", "#C4C4BE", "#E0E0DA"],
  font: '"Geist Sans", system-ui, -apple-system, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

export const OUTCOME_KEYS = ["approved", "pending", "cancelled", "returned"] as const;
export type OutcomeKey = (typeof OUTCOME_KEYS)[number];

export const OUTCOME_COLORS: Record<OutcomeKey, string> = {
  approved: "#2F7A55",
  pending: "#B7862F",
  cancelled: "#B4473A",
  returned: "#7A5C86",
};

export const OUTCOME_LABELS: Record<OutcomeKey, string> = {
  approved: "Approved",
  pending: "Pending",
  cancelled: "Cancelled",
  returned: "RTO",
};
