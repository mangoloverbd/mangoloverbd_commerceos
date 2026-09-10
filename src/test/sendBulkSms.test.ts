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

  const orderPatchStart = serverSource.indexOf('app.patch("/api/orders/:id"');
  const orderPatchEnd = serverSource.indexOf('app.delete("/api/orders"', orderPatchStart);
  const orderPatchSource = serverSource.slice(orderPatchStart, orderPatchEnd);

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

  it("waits for SMS submission before completing order-triggering routes", () => {
    expect(serverSource).toContain('await sendBulkSms(orgId, "confirmation", persistedOrder);');
    expect(courierRouteSource).toContain('await sendBulkSms(orgId, "dispatch", updated);');
    expect(pathaoRouteSource).toContain('await sendBulkSms(orgId, "dispatch", updated);');
  });

  it("sends confirmation SMS when an order first enters an approved status", () => {
    expect(orderPatchSource).toContain("let shouldSendConfirmationSms = false;");
    expect(orderPatchSource).toContain("shouldSendConfirmationSms = toApproved && !fromApproved;");
    expect(orderPatchSource).toContain('await sendBulkSms(orgId, "confirmation", data);');
  });
});
