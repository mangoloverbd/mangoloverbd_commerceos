import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260829000000_warehouses.sql",
);

async function readMigration() {
  return (await readFile(migrationPath, "utf8")).toLowerCase();
}

describe("warehouse migration", () => {
  it("creates an org-scoped RLS-protected warehouse table for service role access", async () => {
    const sql = await readMigration();

    expect(sql).toMatch(/create table public\.warehouses\b/);
    expect(sql).toMatch(/unique \(org_id, id\)/);
    expect(sql).toMatch(/alter table public\.warehouses enable row level security/);
    expect(sql).toMatch(/revoke all on table public\.warehouses from public, anon, authenticated/);
    expect(sql).toMatch(/grant all on table public\.warehouses to service_role/);
  });

  it("keeps warehouse references in their owning workspace", async () => {
    const sql = await readMigration();

    for (const table of ["products", "orders", "social_inbox_orders"]) {
      expect(sql).toMatch(
        new RegExp(
          `alter table public\\.${table} add column warehouse_id uuid;[\\s\\S]*?foreign key \\(org_id, warehouse_id\\)[\\s\\S]*?references public\\.warehouses \\(org_id, id\\)`,
        ),
      );
    }
  });

  it("adds warehouse routing and non-negative weight fields", async () => {
    const sql = await readMigration();

    for (const column of [
      "alter table public.products add column warehouse_id",
      "alter table public.products add column weight_kg",
      "alter table public.product_variants add column weight_kg",
      "alter table public.orders add column warehouse_id",
      "alter table public.orders add column warehouse_auto",
      "alter table public.orders add column weight_kg",
      "alter table public.social_inbox_orders add column warehouse_id",
      "alter table public.social_inbox_orders add column warehouse_auto",
      "alter table public.social_inbox_orders add column weight_kg",
    ]) {
      expect(sql).toContain(column);
    }

    expect(sql).toMatch(/weight_kg is null or weight_kg >= 0/);
    expect(sql).toMatch(/create index products_org_warehouse_idx/);
    expect(sql).toMatch(/create index orders_org_warehouse_created_idx/);
    expect(sql).toMatch(/create index social_inbox_orders_org_warehouse_idx\b/);
  });

  it("repairs one active default warehouse per workspace through a locked service-only function", async () => {
    const sql = await readMigration();

    expect(sql).toMatch(/unique index warehouses_org_default_idx/);
    expect(sql).toMatch(/where is_default and deleted_at is null/);
    expect(sql).toContain("mango lover");
    expect(sql).toMatch(/create function public\.set_default_warehouse\(p_org_id uuid, p_warehouse_id uuid\)/);
    expect(sql).toMatch(/for update/);
    expect(sql).toMatch(/order by warehouse\.id\s+for update/);
    expect(sql).toMatch(/deleted_at is null/);
    expect(sql).toMatch(/set search_path = ''/);
    expect(sql).toMatch(
      /revoke all on function public\.set_default_warehouse\(uuid, uuid\)\s+from public, anon, authenticated/,
    );
    expect(sql).toMatch(/grant execute on function public\.set_default_warehouse\(uuid, uuid\) to service_role/);
  });

  it("defines service-role-only transactional warehouse mutation functions", async () => {
    const sql = await readMigration();

    for (const signature of [
      "create_warehouse(uuid, text, text, text, text, boolean)",
      "update_warehouse(uuid, uuid, text, text, text, text, boolean)",
      "delete_warehouse(uuid, uuid)",
      "bulk_assign_products_to_warehouse(uuid, uuid[], uuid)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature}`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role`);
    }

    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toMatch(/create function public\.delete_warehouse[\s\S]*?update public\.products[\s\S]*?update public\.warehouses/);
    expect(sql).toMatch(/create function public\.bulk_assign_products_to_warehouse[\s\S]*?cardinality\(p_product_ids\)/);
  });
});
