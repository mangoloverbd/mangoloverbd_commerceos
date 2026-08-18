import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("order chat AI mutations (source inspection)", () => {
  const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
  const routeStart = source.indexOf('app.post("/api/order-chat"');
  const routeEnd = source.indexOf('app.post("/api/studio/generate"', routeStart);
  const routeSource = source.slice(routeStart, routeEnd);

  it("imports AI_ACTION_TOOLS, askUserTool, buildRecommendation from ai-actions.js", () => {
    expect(source).toContain('from "./ai-actions.js"');
    expect(source).toMatch(/AI_ACTION_TOOLS/);
    expect(source).toMatch(/askUserTool/);
    expect(source).toMatch(/buildRecommendation/);
  });

  it("attaches tools only when role === admin", () => {
    expect(routeSource).toContain("canMutate");
    expect(routeSource).toMatch(/role\s*===\s*["']admin["']/);
    expect(routeSource).toContain("tools:");
  });

  it("streams question events for ask_user function calls", () => {
    expect(routeSource).toContain('"question"');
    expect(routeSource).toContain("call_id");
  });

  it("streams action events for mutation function calls", () => {
    expect(routeSource).toContain('"action"');
    expect(routeSource).toContain("buildRecommendation");
  });

  it("defines POST /api/order-chat/apply with admin gate + tool allowlist + audit insert", () => {
    const applyStart = source.indexOf('app.post("/api/order-chat/apply"');
    expect(applyStart).toBeGreaterThan(-1);
    const applyEnd = source.indexOf("\n});", applyStart);
    const applySrc = source.slice(applyStart, applyEnd);
    expect(applySrc).toContain("getToken");
    expect(applySrc).toContain("getUser(");
    expect(applySrc).toMatch(/role\s*!==\s*["']admin["']/);
    expect(applySrc).toContain("AI_ACTION_TOOLS");
    expect(applySrc).toContain("executeAiAction");
    expect(applySrc).toContain("ai_action_log");
  });
});
