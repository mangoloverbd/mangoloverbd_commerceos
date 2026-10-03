// Customers (Release 2) is added when its data lands; see
// docs/superpowers/plans/2026-10-03-analytics-page.md.
export const ANALYTICS_TABS = [
  { id: "overview", label: "Overview" },
  { id: "acquisition", label: "Acquisition" },
  { id: "products", label: "Products & pages" },
  { id: "funnel", label: "Funnel & checkout" },
  { id: "stock", label: "Stock & forecast" },
  { id: "health", label: "Data health" },
] as const;
export type AnalyticsTab = (typeof ANALYTICS_TABS)[number]["id"];
// "forecast" is the old AI forecast tab; its links open Stock & forecast.
export const resolveAnalyticsTab = (value: string | null): AnalyticsTab => {
  if (value === "forecast") return "stock";
  return ANALYTICS_TABS.some((tab) => tab.id === value) ? (value as AnalyticsTab) : "overview";
};
export const isWebsiteTab = (tab: AnalyticsTab) => tab !== "stock";
