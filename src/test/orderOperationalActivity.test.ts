import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const ordersTableSource = readFileSync(resolve(process.cwd(), "src/components/OrdersTable.tsx"), "utf8");
const inboxSource = readFileSync(resolve(process.cwd(), "src/pages/InboxOrders.tsx"), "utf8");

describe("operational order activity wiring", () => {
  it("records safe success and failure events for messages, fraud, and couriers", () => {
    expect(serverSource).toContain('eventType: "message.sent"');
    expect(serverSource).toContain('eventType: "message.failed"');
    expect(serverSource).toContain('eventType: "fraud.checked"');
    expect(serverSource).toContain('eventType: "courier.submitted"');
    expect(serverSource).toContain('eventType: "courier.failed"');
    expect(serverSource).toContain('eventType: "courier.status_changed"');
    expect(serverSource).toContain("normalizeOperationalFailureCode");
  });

  it("provides an authenticated workspace-guarded batch print activity endpoint", () => {
    expect(serverSource).toContain('app.post("/api/order-activity/print"');
    expect(serverSource).toMatch(/order-activity\/print[\s\S]*getUser\(getToken\(req\)\)/);
    expect(serverSource).toMatch(/order-activity\/print[\s\S]*\.eq\("org_id", orgId\)/);
    expect(serverSource).toContain('eventType: "document.printed"');
    expect(ordersTableSource).toContain('apiFetch("/api/order-activity/print"');
    expect(inboxSource).toContain('apiFetch("/api/order-activity/print"');
  });

  it("records deletion only after the workspace-scoped delete succeeds", () => {
    expect(serverSource).toContain('eventType: "order.deleted"');
    expect(serverSource).toContain('summary: "Deleted order"');
    expect(serverSource).toContain('summary: "Deleted inbox order"');
  });

  it("records courier status changes from the Steadfast webhook", () => {
    const webhookSection = serverSource.slice(
      serverSource.indexOf('app.post("/api/webhooks/steadfast"'),
      serverSource.indexOf('app.post("/api/webhooks/steadfast"') + 8000,
    );
    expect(webhookSection).toContain('eventType: "courier.status_changed"');
    expect(webhookSection).toContain('actorKind: "courier_webhook"');
  });

  it("normalizes fraud failure metadata instead of storing raw provider responses", () => {
    expect(serverSource).not.toContain("failure_reason: errorMessage");
    expect(serverSource).toContain("failure_reason: normalizeOperationalFailureCode(errorMessage");
  });
});
