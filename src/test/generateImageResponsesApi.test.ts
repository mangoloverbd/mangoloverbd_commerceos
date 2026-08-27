import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("generate image endpoint", () => {
  const serverSource = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
  const routeSource = serverSource.slice(
    serverSource.indexOf('app.post("/api/generate-image"'),
    serverSource.indexOf("const ORDER_CHAT_RESPONSES_MODELS")
  );

  it("uses the Responses API image generation tool", () => {
    expect(routeSource).toContain("https://api.openai.com/v1/responses");
    expect(routeSource).toContain('type: "image_generation"');
    expect(routeSource).toContain('tool_choice: { type: "image_generation" }');
  });

  it("does not call the legacy Images API endpoints from AI chat", () => {
    expect(routeSource).not.toContain("https://api.openai.com/v1/images/generations");
    expect(routeSource).not.toContain("https://api.openai.com/v1/images/edits");
  });
});
