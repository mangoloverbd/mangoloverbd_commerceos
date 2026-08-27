import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("order chat history routes (source inspection)", () => {
  const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

  it("defines GET /api/order-chat/history list endpoint", () => {
    expect(source).toContain('app.get("/api/order-chat/history"');
  });

  it("defines GET /api/order-chat/history/:id detail endpoint", () => {
    expect(source).toContain('app.get("/api/order-chat/history/:id"');
  });

  it("defines POST /api/order-chat/history autosave endpoint", () => {
    expect(source).toContain('app.post("/api/order-chat/history"');
  });

  it("defines DELETE /api/order-chat/history/:id with admin-only gate + org scoping", () => {
    expect(source).toContain('app.delete("/api/order-chat/history/:id"');
    const start = source.indexOf('app.delete("/api/order-chat/history/:id"');
    const end = source.indexOf("\n});", start);
    const delSrc = source.slice(start, end);
    expect(delSrc).toMatch(/role\s*!==\s*["']admin["']/);
    expect(delSrc).toContain('eq("org_id", orgId)');
  });

  it("lists history scoped by org_id and is not admin-gated for reads", () => {
    const getStart = source.indexOf('app.get("/api/order-chat/history",');
    const getEnd = source.indexOf("\n});", getStart);
    const getSrc = source.slice(getStart, getEnd);
    expect(getSrc).toContain('eq("org_id", orgId)');
    expect(getSrc).not.toMatch(/role\s*!==\s*["']admin["']/);
  });

  it("registers the order_chat_history migration at boot (both run paths)", () => {
    expect(source).toContain("migrateOrderChatHistoryTable()");
    const calls = source.split("migrateOrderChatHistoryTable()").length - 1;
    expect(calls).toBeGreaterThanOrEqual(3);
  });
});
