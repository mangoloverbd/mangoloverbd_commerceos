import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260902224522_add_order_items.sql",
);

describe("order item schema", () => {
  it("exposes the complete order_items row shape", () => {
    type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];

    const item: OrderItem = {
      id: "item-id",
      org_id: "org-id",
      order_id: "order-id",
      product_id: null,
      variant_id: null,
      product_name: "Legacy product text",
      variant_name: null,
      unit_price: 100,
      quantity: 1,
      created_at: "2026-09-03T00:00:00Z",
      updated_at: "2026-09-03T00:00:00Z",
    };

    expect(item.quantity).toBeGreaterThan(0);
    expect(item.unit_price).toBeGreaterThanOrEqual(0);
  });

  it("enforces positive quantities and non-negative prices in SQL", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/quantity\s+integer\s+not null[\s\S]*check\s*\(quantity\s*>\s*0\)/i);
    expect(sql).toMatch(/unit_price\s+numeric\(12,\s*2\)\s+not null[\s\S]*check\s*\(unit_price\s*>=\s*0\)/i);
  });

  it("enforces order and catalog references with workspace indexes", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/order_id\s+uuid\s+not null\s+references\s+public\.orders\s*\(id\)/i);
    expect(sql).toMatch(/product_id\s+uuid\s+references\s+public\.products\s*\(id\)/i);
    expect(sql).toMatch(/variant_id\s+uuid\s+references\s+public\.product_variants\s*\(id\)/i);
    expect(sql).toMatch(/order_items_org_order_id_idx[\s\S]*\(org_id,\s*order_id\)/i);
    expect(sql).toMatch(/order_items_org_product_id_idx[\s\S]*\(org_id,\s*product_id\)/i);
    expect(sql).toMatch(/order_items_org_variant_id_idx[\s\S]*\(org_id,\s*variant_id\)/i);
  });

  it("backfills every order and preserves uninterpretable product text", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/insert\s+into\s+public\.order_items/i);
    expect(sql).toMatch(/from\s+public\.orders\s+as\s+o/i);
    expect(sql).toMatch(/left\s+join[\s\S]*public\.products/i);
    expect(sql).toMatch(/coalesce\s*\([\s\S]*catalog_product_name[\s\S]*product_text/i);
    expect(sql).toMatch(/left\s+join[\s\S]*public\.products[\s\S]*p\.org_id\s*=\s*part\.org_id/i);
    expect(sql).toMatch(/where\s+not\s+exists\s*\([\s\S]*from\s+public\.order_items/i);
    expect(sql).toMatch(/greatest\s*\([^)]*1[^)]*\)/i);
  });

  it("keeps the private merchant RLS posture and update timestamps", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/alter\s+table\s+public\.order_items\s+enable\s+row\s+level\s+security/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.order_items\s+from\s+anon,\s*authenticated/i);
    expect(sql).toMatch(/update_order_items_updated_at/i);
  });
});
