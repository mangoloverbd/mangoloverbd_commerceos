import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dashboard order toolbar", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");

  it("renders the rows-per-page control in the pagination footer, not the toolbar", () => {
    const toolbarStart = source.indexOf('data-testid="dashboard-order-toolbar"');
    const toolbar = source.slice(toolbarStart, source.indexOf("<OrderStatusSegmentedControl", toolbarStart));
    const footer = source.slice(source.indexOf("<OrderTablePagination"));

    expect(toolbar).not.toContain("<OrderRowsPerPageSelect");
    expect(footer).toContain("pageSizeControl={");
    expect(footer).toContain('ariaLabel="Rows per page for dashboard orders"');
  });

  it("puts the queue filters inside the toolbar sentence", () => {
    const sentenceStart = source.indexOf('data-testid="dashboard-order-sentence"');
    const sentence = source.slice(sentenceStart, source.indexOf('data-testid="dashboard-order-actions"'));

    for (const testId of ["select-district-filter", "select-print-product-filter", "select-print-weight-filter", "orders-date-filter", "select-warehouse-filter"]) {
      expect(sentence).toContain(`data-testid="${testId}"`);
    }
  });
});
