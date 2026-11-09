import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dashboard order toolbar", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");

  it("renders the rows-per-page control in the toolbar actions, not the pagination footer", () => {
    const actionsStart = source.indexOf('data-testid="dashboard-order-actions"');
    const actions = source.slice(actionsStart, source.indexOf('data-testid="button-create-order"', actionsStart));
    const footerStart = source.indexOf("<OrderTablePagination");
    const footer = source.slice(footerStart, source.indexOf("/>", footerStart));

    expect(actions).toContain("<OrderRowsPerPageSelect");
    expect(actions).toContain('ariaLabel="Rows per page for dashboard orders"');
    expect(footer).not.toContain("pageSizeControl");
  });

  it("puts the queue filters inside the toolbar sentence", () => {
    const sentenceStart = source.indexOf('data-testid="dashboard-order-sentence"');
    const sentence = source.slice(sentenceStart, source.indexOf('data-testid="dashboard-order-actions"'));

    for (const testId of ["select-district-filter", "select-print-product-filter", "select-print-weight-filter", "orders-date-filter", "select-warehouse-filter"]) {
      expect(sentence).toContain(`data-testid="${testId}"`);
    }
  });
});
