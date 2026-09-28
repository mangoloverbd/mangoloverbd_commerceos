export const CHART = {
  ink: "#0B0B0A",
  ink2: "rgba(11,11,10,0.62)",
  ink3: "rgba(11,11,10,0.42)",
  track: "rgba(11,11,10,0.08)",
  rule: "rgba(11,11,10,0.09)",
  bg: "#FAFAF8",
  // Channels, staff and products. The last slot is the grouped "Other" bucket.
  categorical: ["#2563EB", "#0EA5A4", "#E4578F", "#7C6CF2", "#A3ACB9"],
  // Mango accent for the single standout mark in a chart (peak hour, best day, #1).
  highlight: "#F28C28",
  // Intake intensity, quiet to peak. The lightest step must still stand out on the grey panel.
  ramp: ["#F08A1C", "#E06F0E", "#C4560A", "#9A3B04"],
  font: '"Geist Sans", system-ui, -apple-system, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

export const categoricalColor = (index: number) => CHART.categorical[Math.min(index, CHART.categorical.length - 1)];

export const OUTCOME_KEYS = ["approved", "pending", "cancelled", "returned"] as const;
export type OutcomeKey = (typeof OUTCOME_KEYS)[number];

export const OUTCOME_COLORS: Record<OutcomeKey, string> = {
  approved: "#1F9D63",
  pending: "#E0A21B",
  cancelled: "#D9483B",
  returned: "#9A4FA0",
};

export const OUTCOME_LABELS: Record<OutcomeKey, string> = {
  approved: "Approved",
  pending: "Pending",
  cancelled: "Cancelled",
  returned: "RTO",
};
