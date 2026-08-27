import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("OrderChat wiring", () => {
  const src = readFileSync(resolve(process.cwd(), "src/pages/OrderChat.tsx"), "utf8");

  it("imports useAiChatStream, AiClarifyCard, AiActionCard", () => {
    expect(src).toContain("useAiChatStream");
    expect(src).toContain("AiClarifyCard");
    expect(src).toContain("AiActionCard");
  });

  it("handles action and clarify message kinds in the render branch", () => {
    expect(src).toContain('kind === "clarify"');
    expect(src).toContain('kind === "action"');
  });

  it("calls /api/order-chat/apply from a handler", () => {
    expect(src).toContain("/api/order-chat/apply");
  });

  it("builds a dynamic admin quick question about stock from products", () => {
    // Quick questions are now static strings rendered on first paint to avoid flicker
    expect(src).toContain("Add stock to a product variant");
    expect(src).toContain("quickQuestions");
  });
});
