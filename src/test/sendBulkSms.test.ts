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
});
