import { QueryClient } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dhakaToday, pageKeys, prefetchPageData } from "@/lib/pageQueries";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

const ok = (body: unknown) => ({ ok: true, json: async () => body });
const today = format(dhakaToday(), "yyyy-MM-dd");

describe("sidebar page prefetch", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation(async (url: string) => ok({ url }));
  });

  it.each([
    ["/customers", pageKeys.customers, "/api/customers"],
    ["/returns", pageKeys.returns, "/api/returns"],
    ["/inbox/orders", pageKeys.inboxOrders, "/api/social/inbox-orders"],
    ["/inbox/whatsapp", pageKeys.socialConversations("whatsapp"), "/api/social/conversations/whatsapp"],
    ["/order-protection", pageKeys.protectionReviews, "/api/order-protection/reviews?status=on_hold"],
    ["/analytics", pageKeys.websiteAnalytics(today, today), `/api/analytics/website?from=${today}&to=${today}`],
    ["/reports/staff", pageKeys.staffReport(today, today, ""), `/api/reports/staff?from=${today}&to=${today}`],
    ["/reports/business", pageKeys.businessReport(today, today), `/api/reports/business?from=${today}&to=${today}`],
  ])("warms %s under the key its page reads", async (path, key, url) => {
    const client = new QueryClient();
    await prefetchPageData(path, client);
    expect(apiFetch).toHaveBeenCalledWith(url);
    expect(client.getQueryData(key)).toEqual({ url });
  });

  it("warms the activity log for this month, its opening view", async () => {
    const client = new QueryClient();
    const monthStart = format(startOfMonth(dhakaToday()), "yyyy-MM-dd");
    await prefetchPageData("/reports/activity", client);
    expect(client.getQueryData(pageKeys.activityLog(monthStart, today, "", "all", "", 0))).toBeDefined();
  });

  it("reuses a fresh prefetch instead of asking again on every hover", async () => {
    const client = new QueryClient();
    await prefetchPageData("/returns", client);
    await prefetchPageData("/returns", client);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("does nothing for pages it does not know", async () => {
    await prefetchPageData("/settings", new QueryClient());
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("never throws when a prefetch fails; the page loads it itself", async () => {
    apiFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "Forbidden" }) });
    await expect(prefetchPageData("/reports/business", new QueryClient())).resolves.toBeUndefined();
  });
});
