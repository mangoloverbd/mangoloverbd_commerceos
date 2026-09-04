import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Mango Lover deployment boundary", () => {
  it("shows the canonical Mango Lover webhook URL in integration settings", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/IntegrationSettings.tsx"),
      "utf8",
    );

    expect(source).toContain(
      "POST https://admin.mangolover.com.bd/api/custom-orders/webhook",
    );
    expect(source).toContain(
      "https://admin.mangolover.com.bd/api/webhooks/facebook",
    );
    expect(source).toContain(
      "https://admin.mangolover.com.bd/api/webhooks/whatsapp",
    );
    expect(source).toContain(
      "https://admin.mangolover.com.bd/api/auth/shopify/callback",
    );
    expect(source).not.toContain("suite.arclabtechnology.com");
    expect(source).not.toContain("https://merchant-suite.com/api/");
  });
});
