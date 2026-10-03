// Types and pure helpers for the Analytics "Stock & forecast" tab
// (GET /api/analytics/stock-forecast, built by server/stockForecast.js).

export type RestockStatus = "urgent" | "soon" | "ok" | "over" | "no_sales" | "empty";
export type HealthVerdict = "star" | "steady" | "fix_page" | "check_delivery";

export type RestockRow = {
  product_id: string; name: string; stock: number; sold_per_day: number; sold_per_day_30: number; change_pct: number | null;
  days_left: number | null; runs_out: string | null; order_by: string | null; status: RestockStatus; cost_price: number | null;
};
export type HealthRow = {
  product_id: string; name: string; views: number | null; order_rate: number | null; delivered_rate: number | null;
  returned_rate: number | null; orders: number; verdict: HealthVerdict;
};
export type ProfitRow = { product_id: string; name: string; delivered_revenue: number; courier: number; cost: number | null; profit: number | null };
export type ForecastDay = { day: string; orders: number; low: number; high: number };
export type StockAction =
  | { kind: "restock"; severity: "urgent" | "soon"; product_id: string; name: string; rule: string; order_qty: number; order_by: string | null; runs_out: string | null; stock?: number; sold_per_day?: number; change_pct?: number | null }
  | { kind: "fix_page"; severity: "soon"; product_id: string; name: string; rule: string; views: number | null; order_rate: number | null; average: number | null }
  | { kind: "returns"; severity: "soon"; product_id: string; name: string; rule: string; returned_rate: number | null; average: number | null }
  | { kind: "slow"; severity: "info"; product_id: string; name: string; rule: string; stock: number; days_left: number | null }
  | { kind: "cost_price"; severity: "info"; rule: string; count: number };

export type StockForecastResponse = {
  generated_at: string;
  today: string;
  settings: { lead_days: number; safety_days: number; history_days: number };
  summary: {
    next30_delivered_value: number | null; next30_delivered_low: number | null; next30_delivered_high: number | null;
    next7_orders: number; next7_low: number; next7_high: number; busiest_weekday: number; busiest_lift_pct: number | null;
    restock_now: number; first_runs_out: { name: string; runs_out: string | null; order_by: string | null } | null;
    slow_products: number; slow_stock_value: number; slow_with_cost: number; delivered_rate: number | null; missing_cost_products: number;
  };
  forecast: { history: Array<{ day: string; orders: number }>; future: ForecastDay[]; trend: number; value_per_order: number | null };
  actions: StockAction[];
  restock: RestockRow[];
  health: HealthRow[];
  health_averages: { order_rate: number | null; delivered_rate: number | null; returned_rate: number | null };
  profit: ProfitRow[];
  rhythm: { slots: Array<{ id: string; label: string }>; weeks: number; values: number[][] };
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const COVER_OPTIONS = [14, 21, 30] as const;
export type CoverDays = (typeof COVER_OPTIONS)[number];

// Mirrors suggestedOrder() in server/stockForecast.js.
export function suggestedOrder(row: Pick<RestockRow, "sold_per_day" | "stock">, coverDays: number, safetyDays: number, leadDays: number) {
  if (!(row.sold_per_day > 0)) return 0;
  return Math.max(0, Math.ceil(row.sold_per_day * (coverDays + safetyDays + leadDays) - row.stock));
}

export const RESTOCK_STATUS: Record<RestockStatus, { label: string; tone: "bad" | "warn" | "good" | "mango" | "muted" }> = {
  urgent: { label: "Restock now", tone: "bad" },
  soon: { label: "Restock soon", tone: "warn" },
  ok: { label: "Enough", tone: "good" },
  over: { label: "Overstocked", tone: "mango" },
  no_sales: { label: "No sales", tone: "mango" },
  empty: { label: "Not stocked", tone: "muted" },
};

export const VERDICTS: Record<HealthVerdict, { label: string; tone: "good" | "muted" | "warn" | "bad" }> = {
  star: { label: "Star", tone: "good" },
  steady: { label: "Steady", tone: "muted" },
  fix_page: { label: "Fix the page", tone: "warn" },
  check_delivery: { label: "Check delivery", tone: "bad" },
};

export const formatDay = (day: string | null) => (day
  ? new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
  : "—");
const qty = (value: number) => Math.round(value).toLocaleString("en-BD");
const pct = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("en-BD")}%`);

// Plain-language text for one rule-based action.
export function describeAction(action: StockAction): { tag: string; tone: "bad" | "warn" | "mango" | "muted"; title: string; detail: string; rule: string } {
  switch (action.kind) {
    case "restock":
      return {
        tag: "Restock", tone: action.severity === "urgent" ? "bad" : "warn",
        title: `Order ${qty(action.order_qty)} units of ${action.name} by ${formatDay(action.order_by)}`,
        detail: action.severity === "urgent"
          ? `${qty(action.stock ?? 0)} left, selling ${(action.sold_per_day ?? 0).toLocaleString("en-BD", { maximumFractionDigits: 1 })} a day. Runs out ${formatDay(action.runs_out)}.`
          : `Runs out ${formatDay(action.runs_out)}.${action.change_pct ? ` Sales are ${action.change_pct > 0 ? "up" : "down"} ${Math.abs(action.change_pct)}% on the last 30 days.` : ""}`,
        rule: action.severity === "urgent" ? "rule: runs out within 7 days" : "rule: runs out within 14 days",
      };
    case "fix_page":
      return {
        tag: "Fix page", tone: "warn", title: `${action.name}: many views, few orders`,
        detail: `${qty(action.views ?? 0)} views but only ${pct(action.order_rate)} ordered (shop average ${pct(action.average)}). Check the price, photos and delivery charge on the page.`,
        rule: "rule: order rate under half the average, 500+ views",
      };
    case "returns":
      return {
        tag: "Check", tone: "warn", title: `${action.name}: ${pct(action.returned_rate)} returned`,
        detail: `Your shop average is ${pct(action.average)}. Check product quality and the courier on long routes.`,
        rule: "rule: return rate twice the shop average",
      };
    case "slow":
      return {
        tag: "Slow", tone: "mango", title: `Pause buying ${action.name}`,
        detail: `${qty(action.stock)} in stock covers ${qty(action.days_left ?? 0)} days at today's pace. Try a bundle or an offer.`,
        rule: "rule: stock covers more than 60 days",
      };
    case "cost_price":
      return {
        tag: "Setup", tone: "muted", title: `Add cost prices for ${action.count} ${action.count === 1 ? "product" : "products"}`,
        detail: "Profit per product and the value of slow stock need a cost price. Add it in the Cost column on the Products page.",
        rule: "rule: profit needs a cost price",
      };
  }
}
