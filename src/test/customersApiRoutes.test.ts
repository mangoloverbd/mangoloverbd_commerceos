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

  it("serves customers from org-scoped orders and social inbox orders", () => {
    const start = source.indexOf('app.get("/api/customers"');
    const end = source.indexOf('app.post("/api/customers/ai-insight"', start);
    const route = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(route).toContain("await getUser(getToken(req))");
    expect(route).toContain("if (!user) return res.status(401)");
    expect(route).toContain("await getUserOrg(supabase, user.id)");
    expect(route).toContain('.from("orders")');
    expect(route).toContain('.select("*")');
    expect(route).toContain('.eq("org_id", orgId)');
    expect(route).toContain('.from("social_inbox_orders")');
    expect(route).not.toContain("return_status");
    expect(route).not.toContain("fraud_checked");
    expect(route).not.toContain("status, source, notes");
    expect(route).toContain('buildCustomers({ orders: orders || [], inboxOrders: inboxOrders || [] })');
    expect(route).toContain("summarizeCustomers(customers)");
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
});
