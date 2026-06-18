import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("manual order numbering", () => {
  const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

  it("defines a race-safe per-org sequence helper", () => {
    expect(source).toContain("async function getNextManualOrderSeq(orgId)");
    expect(source).toContain('orgSettingKey(orgId, "manual_order_seq")');
    expect(source).toContain('ignoreDuplicates: true');
    expect(source).toContain('.eq("value", currentStr)');
  });

  it("creates manual orders with #M-<seq> numbers", () => {
    const createRoute = source.slice(
      source.indexOf('app.post("/api/orders"'),
      source.indexOf('app.patch("/api/orders/:id"')
    );
    expect(createRoute).toContain("await getNextManualOrderSeq(orgId)");
    expect(createRoute).toContain("#M-${await getNextManualOrderSeq(orgId)}");
  });
});
