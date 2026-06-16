import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AI order extraction route", () => {
  const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
  const routeStart = source.indexOf('app.post("/api/extract-order-from-text"');
  const routeEnd = source.indexOf('app.patch("/api/products/:id"', routeStart);
  const routeSource = source.slice(routeStart, routeEnd);

  it("uses OpenAI first and keeps regex extraction as a fallback", () => {
    expect(routeSource).toContain('process.env.ORDER_EXTRACTION_MODEL || "gpt-4.1-mini"');
    expect(source).toContain('https://api.openai.com/v1/chat/completions');
    expect(routeSource).toContain('extractOrderWithAI(text, regexOrder');
    expect(routeSource).toContain('extractOrderWithRegex(text)');
    expect(routeSource).toContain('source = "ai"');
    expect(routeSource).toContain('source = "regex_fallback"');
  });
});
