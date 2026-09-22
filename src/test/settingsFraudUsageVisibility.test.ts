import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("settings integrations visibility", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Settings.tsx"), "utf8");

  it("does not render the FraudShield usage summary on the integrations page", () => {
    expect(source).not.toContain('import { FraudUsageMeter } from "@/components/FraudUsageMeter";');
    expect(source).not.toContain("<FraudUsageMeter />");
    expect(source).toContain("<IntegrationSettings />");
  });
});
