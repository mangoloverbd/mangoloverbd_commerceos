import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function routeSection(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("social inbox order attribution wiring", () => {
  it("attributes and logs human status transitions in the resolved workspace", () => {
    const patch = routeSection(
      'app.patch("/api/social/inbox-orders/:id"',
      'app.delete("/api/social/inbox-orders/:id"',
    );

    expect(patch).toContain("currentOrder.status");
    expect(patch).toContain("buildAttributionPatch");
    expect(patch).toContain("buildStatusEvent");
    expect(patch).toContain('orderTable: "social_inbox_orders"');
    expect(patch).toContain('actorKind: "user"');
    expect(patch).toContain('.eq("org_id", orgId)');
    expect(patch).not.toMatch(/"(?:created_by|assigned_to|confirmed_by|cancelled_by)"/);
  });

  it("logs an AI cancellation as a system transition without attributing a user", () => {
    const cancellation = routeSection(
      'if (orderAction === "cancel" && existingOrder)',
      '} else if (orderData)',
    );

    expect(cancellation).toContain("recordStatusEvent");
    expect(cancellation).toContain("existingOrder.status");
    expect(cancellation).toContain('orderTable: "social_inbox_orders"');
    expect(cancellation).toContain('toStatus: "cancelled"');
    expect(cancellation).toContain("actorId: null");
    expect(cancellation).toContain('actorKind: "system"');
    expect(cancellation).not.toMatch(/(?:created_by|assigned_to|confirmed_by|cancelled_by)\s*:/);
  });
});
