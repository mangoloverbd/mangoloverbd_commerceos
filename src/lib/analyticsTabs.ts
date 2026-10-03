// More tabs (Acquisition, Products & pages, Funnel & checkout, Customers, Data
// health) are added as their first-party data lands; see
// docs/superpowers/plans/2026-10-03-analytics-page.md.
export const ANALYTICS_TABS = [
  { id: "overview", label: "Overview" },
  { id: "forecast", label: "AI forecast" },
] as const;
export type AnalyticsTab = (typeof ANALYTICS_TABS)[number]["id"];
export const resolveAnalyticsTab = (value: string | null): AnalyticsTab =>
  ANALYTICS_TABS.some((tab) => tab.id === value) ? (value as AnalyticsTab) : "overview";
