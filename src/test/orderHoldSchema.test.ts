import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ORDER_HOLD_REASONS } from "../../shared/orderHold.js";

describe("order hold schema migration", () => {
  it("adds nullable structured hold metadata without rewriting existing orders", () => {
    const migrations = readdirSync("supabase/migrations")
      .filter((name) => name.endsWith("_order_hold_metadata.sql"));
    expect(migrations).toHaveLength(1);

    const sql = readFileSync(`supabase/migrations/${migrations[0]}`, "utf8");
    expect(sql).toContain("add column if not exists hold_reason_code text");
    expect(sql).toContain("add column if not exists hold_reason_detail text");
    expect(sql).toContain("add column if not exists hold_until_date date");
    expect(sql).toContain("customer_requested_after_date");
    expect(sql).toContain("hold_until_date is not null");
    expect(sql).toContain("hold_until_date is null");
    expect(sql).toContain("hold_reason_code is not null");
    expect(sql.toLowerCase()).not.toMatch(/\bupdate\s+public\.orders\b/);

    for (const { code } of ORDER_HOLD_REASONS) expect(sql).toContain(`'${code}'`);
  });

  it("exposes all hold fields in the generated orders row, insert, and update types", () => {
    const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
    const orders = types.slice(types.indexOf("      orders: {"), types.indexOf("      product_images: {"));
    for (const field of ["hold_reason_code", "hold_reason_detail", "hold_until_date"]) {
      expect(orders.match(new RegExp(`${field}\\??: string \\| null`, "g")) ?? []).toHaveLength(3);
    }
  });
});
