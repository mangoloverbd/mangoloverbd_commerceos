import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const newOrder = readFileSync(resolve(process.cwd(), "src/pages/NewOrder.tsx"), "utf8");
const cartPanel = readFileSync(
  resolve(process.cwd(), "src/components/order-editor/CartPanel.tsx"),
  "utf8",
);
const orderDetail = readFileSync(
  resolve(process.cwd(), "src/pages/OrderDetail.tsx"),
  "utf8",
);

function sectionBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("advance payment (TDD RED)", () => {
  it("PATCH /api/orders/:id accepts advanced_payment and payment_method", () => {
    const patch = sectionBetween(server, 'app.patch("/api/orders/:id"', 'app.post("/api/orders/:id/send-sms"');
    expect(patch).toContain('"advanced_payment"');
    expect(patch).toContain('"payment_method"');
  });

  it("PATCH validates advance is within 0 and order total", () => {
    const patch = sectionBetween(server, 'app.patch("/api/orders/:id"', 'app.post("/api/orders/:id/send-sms"');
    expect(patch).toContain("advanced_payment");
    expect(patch).toMatch(/Advance.*non-negative|advance.*exceed|Advance payment/i);
  });

  it("courier COD collects due only (total minus advance)", () => {
    const steadfastBulk = sectionBetween(server, 'app.post("/api/send-to-courier/bulk"', 'app.post("/api/send-to-courier"');
    const steadfastSingle = sectionBetween(server, 'app.post("/api/send-to-courier"', 'app.post("/api/send-to-pathao"');
    const pathao = sectionBetween(server, 'app.post("/api/send-to-pathao"', 'app.post("/api/inbox-orders/send-to-courier"');
    for (const [name, section] of [["bulk", steadfastBulk], ["single", steadfastSingle], ["pathao", pathao]] as const) {
      const amounts = section.split("\n").filter((line) => line.includes("cod_amount") || line.includes("amount_to_collect"));
      expect(amounts.length, `${name} dispatch amounts`).toBeGreaterThan(0);
      for (const line of amounts) {
        expect(line, `${name}: ${line.trim()}`).toContain("advanced_payment");
      }
    }
  });

  it("New Order clamps advance to the total with no Full button", () => {
    expect(newOrder).toContain("Advance");
    expect(newOrder).toContain("max={total}");
    expect(newOrder).not.toContain(">Full<");
    expect(cartPanel).not.toContain(">Full<");
  });

  it("orders table total shows due with advance hint", () => {
    const table = readFileSync(resolve(process.cwd(), "src/components/OrdersTable.tsx"), "utf8");
    expect(table).toContain("advanced_payment");
    expect(table).toContain("adv ৳");
    expect(table).toContain("caption");
  });

  it("advance input stays empty at zero and due shows as a chip", () => {
    for (const [name, source] of [["new-order", newOrder], ["cart-panel", cartPanel]] as const) {
      expect(source, `${name} blank-at-zero`).toContain('placeholder="0"');
      expect(source, `${name} chip due`).toContain("Chip");
    }
  });

  it("edit-page cart panel has an inline advance row", () => {
    expect(cartPanel).toContain("Advance");
    expect(orderDetail).toContain("dvance");
  });
});
