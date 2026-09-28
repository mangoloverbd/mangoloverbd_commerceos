import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("customers API routes", () => {
  const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

  it("looks up the latest matching customer inside the authenticated workspace", () => {
    const start = source.indexOf('app.get("/api/customers/lookup"');
    const end = source.indexOf('app.get("/api/customers"', start);
    const route = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(route).toContain("const token = getToken(req)");
    expect(route).toContain("await getUser(token)");
    expect(route).toContain("if (!user) return res.status(401)");
    expect(route).toContain("await getUserOrg(supabase, user.id)");
    expect(route).toContain("customerPhoneCandidates(req.query.phone)");
    expect(route).toContain('.from("orders")');
    expect(route).toContain('.select("customer_name, address, created_at")');
    expect(route).toContain('.eq("org_id", orgId)');
    expect(route).toContain('.in("phone", phoneCandidates)');
    expect(route).toContain('.order("created_at", { ascending: false })');
    expect(route).toContain(".limit(1)");
    expect(route).toContain(".maybeSingle()");
    expect(route).toContain('.ilike("phone", `%${normalizedPhone.slice(-4)}`)');
    expect(route).toContain("findCustomerOrderByPhone(formattedCandidates, normalizedPhone)");
  });

  it("serves customers from every page of org-scoped orders and social inbox orders", () => {
    const start = source.indexOf('app.get("/api/customers"');
    const end = source.indexOf('app.post("/api/customers/ai-insight"', start);
    const route = source.slice(start, end);
    const helperStart = source.indexOf("async function fetchAllWorkspaceRows");
    const helper = source.slice(helperStart, source.indexOf('app.get("/api/customers"', helperStart));

    expect(start).toBeGreaterThan(-1);
    expect(route).toContain("await getUser(getToken(req))");
    expect(route).toContain("if (!user) return res.status(401)");
    expect(route).toContain("await getUserOrg(supabase, user.id)");
    expect(route).toContain("await loadWorkspaceCustomers(supabase, orgId)");
    expect(route).toContain("summarizeCustomers(customers)");

    expect(helper).toContain('.select("*")');
    expect(helper).toContain('.eq("org_id", orgId)');
    expect(helper).toContain(".range(from, from + CUSTOMER_ORDER_PAGE_SIZE - 1)");
    expect(helper).toContain("data.length < CUSTOMER_ORDER_PAGE_SIZE");
    expect(helper).toContain('fetchAllWorkspaceRows(supabase, "orders", orgId)');
    expect(helper).toContain('fetchAllWorkspaceRows(supabase, "social_inbox_orders", orgId)');
    expect(helper).toContain("buildCustomers({ orders, inboxOrders })");
  });

  it("provides an authenticated AI customer insight endpoint", () => {
    const start = source.indexOf('app.post("/api/customers/ai-insight"');
    const end = source.indexOf("// Orders", start);
    const route = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(route).toContain("rateLimitAI");
    expect(route).toContain("await getUser(getToken(req))");
    expect(route).toContain("if (!user) return res.status(401)");
    expect(route).toContain("await getUserOrg(supabase, user.id)");
    expect(route).toContain("buildCustomerAiInsight(customer)");
    expect(route).toContain("AI_API_KEY");
  });
  it("sends customer SMS only to this workspace's customers, with a recipient cap", () => {
    const start = source.indexOf('app.post("/api/customers/send-sms"');
    const end = source.indexOf("// ── Order attribution", start);
    const route = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(route).toContain("await getUser(getToken(req))");
    expect(route).toContain("if (!user) return res.status(401)");
    expect(route).toContain("await getUserOrg(supabase, user.id)");
    expect(route).toContain("MAX_CUSTOMER_SMS_RECIPIENTS");
    expect(route).toContain("await loadWorkspaceCustomers(supabase, orgId)");
    expect(route).toContain("planCustomerSms({ customers, customerIds, message, normalizePhone: normalizeBdPhone })");
    expect(route).not.toContain("req.body.phone");
  });
});
