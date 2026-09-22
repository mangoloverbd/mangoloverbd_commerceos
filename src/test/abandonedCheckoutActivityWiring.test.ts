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

const patchRoute = () =>
  routeSection('app.patch("/api/abandoned-checkouts/:id"', 'app.post("/api/abandoned-checkouts/:id/convert"');

const convertRoute = () =>
  routeSection('app.post("/api/abandoned-checkouts/:id/convert"', 'app.get("/api/orders/:id"');

describe("abandoned checkout activity wiring", () => {
  it("records a status event when a staff member contacts/dismisses/reopens a checkout", () => {
    const section = patchRoute();
    expect(section).toContain("recordStatusEvent");
    expect(section).toContain('orderTable: "abandoned_checkouts"');
    expect(section).toContain('actorKind: "user"');
    expect(section).toContain("actorId: user.id");
  });

  it("stamps created_by/assigned_to/confirmed attribution when converting a checkout to an order", () => {
    const section = convertRoute();
    expect(section).toContain("created_by: user.id");
    expect(section).toContain("assigned_to: user.id");
    expect(section).toContain("buildAttributionPatch");
  });

  it("writes both the order creation event and the checkout recovered event on conversion", () => {
    const section = convertRoute();
    const eventCalls = section.match(/recordStatusEvent/g) || [];
    expect(eventCalls.length).toBeGreaterThanOrEqual(2);
    expect(section).toContain('orderTable: "orders"');
    expect(section).toContain('orderTable: "abandoned_checkouts"');
    expect(section).toContain('toStatus: "recovered"');
  });
});
