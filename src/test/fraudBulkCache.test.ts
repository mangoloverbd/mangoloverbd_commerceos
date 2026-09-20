import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function section(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("bulk fraud checks reuse cache", () => {
  it("lets the legacy order check opt out of force so bulk skips fresh cache", () => {
    const server = read("server/index.js");
    const legacy = section(server, 'app.post("/api/check-fraud"', 'app.post("/api/inbox-orders/check-fraud"');

    expect(legacy).toContain("req.body?.force !== false");
    // Contract preserved: still routes through the cache and reports spend.
    expect(legacy).toContain("runFraudCheck(supabase, orgId,");
    expect(legacy).toContain("fraud_checked: true");
    expect(legacy).toContain("spentRequest");
  });

  it("lets the legacy inbox check opt out of force too", () => {
    const server = read("server/index.js");
    const legacy = section(server, 'app.post("/api/inbox-orders/check-fraud"', "// ─── Unified Social Inbox");

    expect(legacy).toContain("req.body?.force !== false");
    expect(legacy).toContain("spentRequest");
  });

  it("sends force:false from the orders bulk handler but not the single handler", () => {
    const table = read("src/components/OrdersTable.tsx");
    const bulk = section(table, "const handleBulkFraudCheck", "const bulkSelectionOrders");
    const single = section(table, "const handleCheckFraud", "const handleBulkFraudCheck");

    expect(bulk).toContain("force: false");
    expect(single).not.toContain("force: false");
  });

  it("sends force:false from the inbox bulk handler but not the single handler", () => {
    const page = read("src/pages/InboxOrders.tsx");
    const bulk = section(page, "const handleBulkFraudCheck", "// ─── Invoice ───");
    const single = section(page, "const handleCheckFraud", "const handleBulkFraudCheck");

    expect(bulk).toContain("force: false");
    expect(single).not.toContain("force: false");
  });
});
