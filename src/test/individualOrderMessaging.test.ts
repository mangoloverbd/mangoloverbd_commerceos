import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("individual order messaging route", () => {
  const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
  const start = server.indexOf('app.post("/api/orders/:id/send-sms"');
  const end = server.indexOf('app.delete("/api/orders"', start);
  const route = server.slice(start, end);

  it("is authenticated and workspace scoped", () => {
    expect(route).toContain("getUser(getToken(req))");
    expect(route).toContain("getUserOrg(supabase, user.id)");
    expect(route).toContain('.eq("id", req.params.id)');
    expect(route).toContain('.eq("org_id", orgId)');
  });

  it("accepts only a message and sends the stored phone", () => {
    expect(route).toContain("req.body?.message");
    expect(route).toContain('select("id, order_number, phone")');
    expect(route).toContain("sendManualBulkSms");
    expect(route).not.toContain("req.body?.phone");
  });
});
