import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ORDER_PROTECTION_THRESHOLDS } from "../../server/orderSubmissionProtection.js";

describe("order protection deployment contract", () => {
  it("keeps production secrets server-side and uses the approved address model", () => {
    const envExample = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    expect(envExample).toContain("ORDER_PROTECTION_HASH_SECRET=");
    expect(envExample).toContain("TURNSTILE_SECRET_KEY=");
    expect(envExample).toContain("ADDRESS_VALIDATION_MODEL=gpt-4o-mini");
    expect(envExample).not.toContain("VITE_OPENAI_API_KEY");
    expect(ORDER_PROTECTION_THRESHOLDS.reviewTtlDays).toBe(30);
  });

  it("documents the no-order side effects for held and blocked outcomes", () => {
    const runbook = readFileSync(resolve(process.cwd(), "docs/runbooks/order-protection.md"), "utf8");
    expect(runbook).toContain("No order, stock decrement, or purchase event");
    expect(runbook).toContain("gpt-4o-mini");
  });
});
