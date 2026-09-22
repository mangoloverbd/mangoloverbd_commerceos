import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const pageSource = readFileSync(resolve(process.cwd(), "src/pages/Returns.tsx"), "utf8");

function returnsRoute() {
  const start = serverSource.indexOf('app.get("/api/returns"');
  const end = serverSource.indexOf('app.post("/api/returns/request"', start);
  return serverSource.slice(start, end);
}

describe("returns order source", () => {
  it("never labels a return as Shopify", () => {
    expect(returnsRoute()).not.toContain('"shopify"');
    expect(pageSource).not.toContain("shopify");
  });

  it("reads the real channel from each order table", () => {
    const route = returnsRoute();
    expect(route).toContain("courier_fee, consignment_id, return_status, return_reason, return_requested_at, sent_to_courier, source, created_at");
    expect(route).toContain('order_source: o.source || "manual_other"');
    expect(route).toContain("order_source: o.platform");
  });

  it("keeps the table discriminator separate from the displayed channel", () => {
    const route = returnsRoute();
    expect(route).toContain('source: "orders"');
    expect(route).toContain('source: "inbox"');
    const requestStart = serverSource.indexOf('app.post("/api/returns/request"');
    const requestRoute = serverSource.slice(requestStart, requestStart + 1200);
    expect(requestRoute).toContain('const table = source === "inbox" ? "social_inbox_orders" : "orders";');
  });

  it("renders the channel label on the page", () => {
    expect(pageSource).toContain('import { orderSourceLabel } from "@/lib/orderSource"');
    expect(pageSource).toContain("{orderSourceLabel(order.order_source)}");
    expect(pageSource).toContain('source: "orders" | "inbox"');
    expect(pageSource).toContain("order_source: string");
  });
});
