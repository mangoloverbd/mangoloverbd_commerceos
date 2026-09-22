import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const orderDetailSource = readFileSync(resolve(process.cwd(), "src/pages/OrderDetail.tsx"), "utf8");

describe("detailed status event legacy linkage", () => {
  it("creates a stable legacy event id before writing the detailed event", () => {
    expect(source).toContain("function prepareStatusEvent");
    expect(source).toContain("legacy_status_event_id: statusEvent?.id");
  });

  it("links manual order creation to its exact legacy event", () => {
    const createSection = source.slice(
      source.indexOf('app.post("/api/orders"'),
      source.indexOf('app.post("/api/orders"') + 12000,
    );
    expect(createSection).toContain("prepareStatusEvent");
    expect(createSection).toContain("legacy_status_event_id");
  });

  it("derives a distinct idempotency key per operation segment", () => {
    expect(source).toContain("function buildOperationRequestId");
    expect(source).toContain("buildOperationRequestId(activityGroupId");
    expect(source).toContain("requestId");
  });

  it("rejects stale order writes with a conflict", () => {
    expect(source).toContain("expected_updated_at");
    expect(source).toContain("Order changed before it could be saved");
  });

  it("recovers explicitly from partial saves and stale conflicts in the order editor", () => {
    expect(orderDetailSource).toContain("expected_updated_at");
    expect(orderDetailSource).toContain("Partial save:");
    expect(orderDetailSource).toContain("Order changed before it could be saved");
  });
});
