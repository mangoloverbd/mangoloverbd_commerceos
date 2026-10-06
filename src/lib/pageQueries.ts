import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { format, startOfMonth, subDays } from "date-fns";
import { apiFetch } from "@/lib/api";
import { WAREHOUSES_QUERY_KEY } from "@/hooks/useWarehouses";

// Data the dashboard pages open with, shared by the pages and by the sidebar's
// hover prefetch. Each key here is the one its page reads, so a prefetch always
// warms exactly what the page will show.

/** Today in Dhaka, as a local date (the pages' default ranges start here). */
export function dhakaToday(): Date {
  const dhaka = new Date(Date.now() + 6 * 60 * 60 * 1000);
  return new Date(dhaka.getUTCFullYear(), dhaka.getUTCMonth(), dhaka.getUTCDate());
}

const ymd = (date: Date) => format(date, "yyyy-MM-dd");

/** GET a JSON body; a failed response throws its `error` message. */
export async function getJson<T>(url: string, fallbackError = "Request failed"): Promise<T> {
  const response = await apiFetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : fallbackError);
  return body as T;
}

function rangeQuery(from: string | null, to: string | null) {
  const params = new URLSearchParams();
  if (from && to) {
    params.set("from", from);
    params.set("to", to);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const pageKeys = {
  overview: (since: string | null, until: string | null) => ["/api/overview", since, until] as const,
  customers: ["/api/customers"] as const,
  products: ["/api/products"] as const,
  returns: ["/api/returns"] as const,
  inboxOrders: ["/api/social/inbox-orders"] as const,
  socialConversations: (platform: string) => ["/api/social/conversations", platform] as const,
  protectionReviews: ["/api/order-protection/reviews", "on_hold"] as const,
  websiteAnalytics: (from: string | null, to: string | null) => ["/api/analytics/website", from, to] as const,
  staffReport: (from: string | null, to: string | null, staff: string) => ["staff-performance", from, to, staff] as const,
  businessReport: (from: string | null, to: string | null) => ["business-report", from, to] as const,
  activityLog: (from: string | null, to: string | null, staff: string, table: string, actions: string, page: number) =>
    ["activity-log", from, to, staff, table, actions, page] as const,
};

export function overviewUrl(since: string | null, until: string | null) {
  const params = new URLSearchParams();
  if (since) params.set("since", since);
  if (until) params.set("until", until);
  const query = params.toString();
  return `/api/overview${query ? `?${query}` : ""}`;
}

export const socialConversationsUrl = (platform: string) => `/api/social/conversations/${platform}`;

// A hover is a strong hint, not a click: data fetched in the last half minute is reused.
const PREFETCH_FRESH_MS = 30_000;

function warm(queryClient: QueryClient, queryKey: QueryKey, url: string) {
  return queryClient.prefetchQuery({ queryKey, queryFn: () => getJson(url), staleTime: PREFETCH_FRESH_MS });
}

// What each page opens with, by path. Pages whose opening view needs the user's own
// choices (a selected staff member, a campaign range) are left to load themselves.
const PAGE_PREFETCH: Record<string, (queryClient: QueryClient) => Promise<unknown>> = {
  "/overview": (queryClient) => {
    const today = dhakaToday();
    const since = ymd(subDays(today, 6));
    const until = ymd(today);
    return warm(queryClient, pageKeys.overview(since, until), overviewUrl(since, until));
  },
  "/customers": (queryClient) => Promise.all([
    warm(queryClient, pageKeys.customers, "/api/customers"),
    warm(queryClient, pageKeys.products, "/api/products"),
  ]),
  "/products": (queryClient) => Promise.all([
    warm(queryClient, pageKeys.products, "/api/products"),
    warm(queryClient, [WAREHOUSES_QUERY_KEY], WAREHOUSES_QUERY_KEY),
  ]),
  "/warehouses": (queryClient) => warm(queryClient, [WAREHOUSES_QUERY_KEY], WAREHOUSES_QUERY_KEY),
  "/returns": (queryClient) => warm(queryClient, pageKeys.returns, "/api/returns"),
  "/inbox/orders": (queryClient) => warm(queryClient, pageKeys.inboxOrders, "/api/social/inbox-orders"),
  "/inbox/facebook": (queryClient) => warm(queryClient, pageKeys.socialConversations("facebook"), socialConversationsUrl("facebook")),
  "/inbox/instagram": (queryClient) => warm(queryClient, pageKeys.socialConversations("instagram"), socialConversationsUrl("instagram")),
  "/inbox/whatsapp": (queryClient) => warm(queryClient, pageKeys.socialConversations("whatsapp"), socialConversationsUrl("whatsapp")),
  "/order-protection": (queryClient) => warm(queryClient, pageKeys.protectionReviews, "/api/order-protection/reviews?status=on_hold"),
  "/analytics": (queryClient) => {
    const today = ymd(dhakaToday());
    return warm(queryClient, pageKeys.websiteAnalytics(today, today), `/api/analytics/website${rangeQuery(today, today)}`);
  },
  "/reports/staff": (queryClient) => {
    const today = ymd(dhakaToday());
    return warm(queryClient, pageKeys.staffReport(today, today, ""), `/api/reports/staff${rangeQuery(today, today)}`);
  },
  "/reports/business": (queryClient) => {
    const today = ymd(dhakaToday());
    return warm(queryClient, pageKeys.businessReport(today, today), `/api/reports/business${rangeQuery(today, today)}`);
  },
  "/reports/activity": (queryClient) => {
    const today = dhakaToday();
    const from = ymd(startOfMonth(today));
    const to = ymd(today);
    return warm(queryClient, pageKeys.activityLog(from, to, "", "all", "", 0), `/api/reports/activity${rangeQuery(from, to)}`);
  },
};

/** Warm the data a page opens with (best effort; unknown paths do nothing). */
export function prefetchPageData(path: string, queryClient: QueryClient): Promise<unknown> {
  return (PAGE_PREFETCH[path]?.(queryClient) ?? Promise.resolve()).catch(() => undefined);
}
