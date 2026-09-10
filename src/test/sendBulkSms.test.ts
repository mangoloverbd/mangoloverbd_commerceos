import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("sendBulkSms Helper and Courier Dispatch SMS Trigger", () => {
  const serverSource = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

  const courierRouteStart = serverSource.indexOf('app.post("/api/send-to-courier"');
  const courierRouteEnd = serverSource.indexOf('app.post("/api/send-to-pathao"', courierRouteStart);
  const courierRouteSource = serverSource.slice(courierRouteStart, courierRouteEnd);

  const pathaoRouteStart = serverSource.indexOf('app.post("/api/send-to-pathao"');
  const pathaoRouteEnd = serverSource.indexOf('app.post("/api/pathao/refresh-status"', pathaoRouteStart);
  const pathaoRouteSource = serverSource.slice(pathaoRouteStart, pathaoRouteEnd);

  const orderCreateStart = serverSource.indexOf('app.post("/api/orders"');
  const orderCreateEnd = serverSource.indexOf('app.patch("/api/orders/:id"', orderCreateStart);
  const orderCreateSource = serverSource.slice(orderCreateStart, orderCreateEnd);

  const orderPatchStart = serverSource.indexOf('app.patch("/api/orders/:id"');
  const orderPatchEnd = serverSource.indexOf('app.delete("/api/orders"', orderPatchStart);
  const orderPatchSource = serverSource.slice(orderPatchStart, orderPatchEnd);

  const inboxSaveStart = serverSource.indexOf('async function saveMetaInboxOrder');
  const inboxSaveEnd = serverSource.indexOf('// ─── Platform send helpers', inboxSaveStart);
  const inboxSaveSource = serverSource.slice(inboxSaveStart, inboxSaveEnd);

  it("triggers sendBulkSms in steadfast courier dispatch", () => {
    // Assert sendBulkSms is triggered with the dispatch type and updated order in the steadfast dispatch endpoint
    expect(courierRouteSource).toContain("sendBulkSms");
    expect(courierRouteSource).toContain('"dispatch"');
  });

  it("triggers sendBulkSms in pathao courier dispatch", () => {
    // Assert sendBulkSms is triggered with the dispatch type and updated order in the pathao dispatch endpoint
    expect(pathaoRouteSource).toContain("sendBulkSms");
    expect(pathaoRouteSource).toContain('"dispatch"');
  });

  it("formats recipients for the BulkSMSBD gateway and validates submission success", () => {
    expect(serverSource).toContain('const bulkSmsPhone = `880${phone.slice(1)}`;');
    expect(serverSource).toContain("const response = await fetch(url);");
    expect(serverSource).toContain("const responseCode = Number(data?.response_code);");
    expect(serverSource).toContain("response.ok && responseCode === 202");
  });

  it("supports independent confirmation and dispatch template switches", () => {
    expect(serverSource).toContain('`${orgId}:bulksms_confirmation_enabled`');
    expect(serverSource).toContain('`${orgId}:bulksms_dispatch_enabled`');
    expect(serverSource).toContain('type === "confirmation"');
    expect(serverSource).toContain('type === "dispatch"');
    expect(serverSource).toContain('templateEnabled === "false"');
  });

  it("waits for SMS submission before completing order-triggering routes", () => {
    expect(serverSource).toContain('await sendBulkSms(orgId, "confirmation", persistedOrder);');
    expect(courierRouteSource).toContain('await sendBulkSms(orgId, "dispatch", updated);');
    expect(pathaoRouteSource).toContain('await sendBulkSms(orgId, "dispatch", updated);');
  });

  it("sends confirmation SMS after dashboard order creation completes", () => {
    expect(orderCreateSource).toContain('await sendBulkSms(orgId, "confirmation", data);');
    expect(orderCreateSource.indexOf('await sendBulkSms(orgId, "confirmation", data);')).toBeGreaterThan(
      orderCreateSource.indexOf('.from("orders")'),
    );
  });

  it("sends confirmation SMS for a newly saved Social Inbox order", () => {
    expect(inboxSaveSource).toContain("const inboxSmsPhone = normalizeBdPhone(");
    expect(inboxSaveSource).toContain('await sendBulkSms(orgId, "confirmation", {');
    expect(inboxSaveSource).toContain("phone: inboxSmsPhone");
  });

  it("does not send confirmation SMS when an executive approves an order", () => {
    expect(orderPatchSource).not.toContain("shouldSendConfirmationSms");
    expect(orderPatchSource).not.toContain('sendBulkSms(orgId, "confirmation"');
  });
});
