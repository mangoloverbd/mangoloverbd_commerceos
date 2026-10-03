// Customers (Release 2) is added when its data lands; see
// docs/superpowers/plans/2026-10-03-analytics-page.md.
export const ANALYTICS_TABS = [
  { id: "overview", label: "Overview" },
  { id: "acquisition", label: "Acquisition" },
  { id: "products", label: "Products & pages" },
  { id: "funnel", label: "Funnel & checkout" },
  { id: "forecast", label: "AI forecast" },
  { id: "health", label: "Data health" },
] as const;
export type AnalyticsTab = (typeof ANALYTICS_TABS)[number]["id"];
export const resolveAnalyticsTab = (value: string | null): AnalyticsTab =>
  ANALYTICS_TABS.some((tab) => tab.id === value) ? (value as AnalyticsTab) : "overview";
export const isWebsiteTab = (tab: AnalyticsTab) => tab !== "forecast";
