import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("district alias API", () => {
  it("serves and learns district aliases behind auth with org guards", () => {
    const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

    expect(server).toContain('app.get("/api/orders/district-aliases"');
    expect(server).toContain('app.post("/api/orders/resolve-districts"');
    const getStart = server.indexOf('app.get("/api/orders/district-aliases"');
    const postStart = server.indexOf('app.post("/api/orders/resolve-districts"');
    expect(server.slice(getStart, postStart)).toContain("getUser(getToken(req))");
    expect(server.slice(postStart)).toContain("getUser(getToken(req))");
    expect(server.slice(postStart)).toContain("getUserOrg(supabase, user.id)");
    expect(server).toContain("district_aliases");
    expect(server).toContain("process.env.DISTRICT_MODEL");
    expect(server).toContain('"gpt-4o-mini"');
    expect(server).toContain("__unknown__");
    const postEnd = (() => {
      const rest = server.slice(postStart + 50);
      const next = rest.search(/\napp\.(get|post|patch|put|delete)\("/);
      return next === -1 ? server.length : postStart + 50 + next;
    })();
    const postBody = server.slice(postStart, postEnd);
    expect(postBody).toContain("slice(0, 50)");
    expect(postBody).not.toContain('from("orders")');
  });
});
