import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Mango Lover order-number migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260910170052_ml_order_numbering.sql"),
    "utf8",
  );

  it("creates the atomic ML order allocator and uniqueness guard", () => {
    expect(sql).toMatch(/create sequence if not exists public\.orders_order_number_seq/i);
    expect(sql).toMatch(/start with 150000/i);
    expect(sql).toMatch(/create or replace function public\.next_ml_order_number\(\)/i);
    expect(sql).toContain("'ML-' || nextval('public.orders_order_number_seq')::text");
    expect(sql).toMatch(/set search_path = ''/i);
    expect(sql).toMatch(/revoke all on function public\.next_ml_order_number/i);
    expect(sql).toMatch(/grant execute on function public\.next_ml_order_number.*service_role/i);
    expect(sql).toMatch(/create unique index.*orders_org_order_number_unique_idx/i);
  });
});
