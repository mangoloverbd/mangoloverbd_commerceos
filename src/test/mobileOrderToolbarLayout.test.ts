import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("mobile dashboard order toolbar", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");

  it("renders the rows-per-page control beside the mobile order count", () => {
    const headerStart = source.indexOf('data-testid="dashboard-order-toolbar"');
    const actionsStart = source.indexOf('data-testid="dashboard-order-actions"');
    const header = source.slice(headerStart, actionsStart);
    const actions = source.slice(actionsStart, source.indexOf("<OrderStatusSegmentedControl", actionsStart));

    expect(header).toContain("isMobile &&");
    expect(header).toContain('ariaLabel="Rows per page for dashboard orders"');
    expect(actions).toContain("!isMobile &&");
  });
});
