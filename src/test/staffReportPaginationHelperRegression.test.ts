import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

describe("staff report pagination helper regression", () => {
  it("uses the defined shared pagination helper when loading product variants", () => {
    const routeStart = source.indexOf('app.get("/api/reports/staff"');
    const routeEnd = source.indexOf("// ─── Business Report", routeStart);

    expect(routeStart).toBeGreaterThanOrEqual(0);
    expect(routeEnd).toBeGreaterThan(routeStart);
    expect(source.slice(routeStart, routeEnd)).not.toContain("fetchStaffReportPages");
  });
});
