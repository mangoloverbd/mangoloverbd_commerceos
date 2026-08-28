import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const baselinePath = resolve(
  process.cwd(),
  "supabase/migrations/20260828000000_canonical_schema_reconciliation.sql",
);

describe("canonical Supabase baseline", () => {
  it("declares every runtime table and enables RLS", async () => {
    const sql = await readFile(baselinePath, "utf8");
    const runtimeTables = [
      "user_roles",
      "app_settings",
      "orders",
      "products",
      "product_images",
      "product_variants",
      "storefront_settings",
      "social_conversations",
      "social_messages",
      "social_inbox_orders",
      "meta_connections",
      "meta_pages",
      "meta_instagram_accounts",
      "meta_whatsapp_accounts",
      "meta_ad_accounts",
      "meta_webhook_events",
      "order_chat_history",
      "ai_action_log",
    ];

    for (const table of runtimeTables) {
      expect(sql).toMatch(
        new RegExp(`create table(?: if not exists)? public\\.${table}\\b`, "i"),
      );
      expect(sql).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, "i"),
      );
    }
  });

  it("denies public commerce access and limits helper execution", async () => {
    const sql = await readFile(baselinePath, "utf8");

    expect(sql).toMatch(/revoke all on all tables in schema public from anon, authenticated/i);
    expect(sql).toMatch(/revoke execute on all functions in schema public from public, anon, authenticated/i);
    expect(sql).toMatch(/revoke create on schema public from public/i);
    expect(sql).not.toMatch(
      /grant execute on function public\.has_role\(uuid, public\.app_role\) to authenticated/i,
    );
    expect(sql).not.toMatch(
      /grant\s+(?:select|insert|update|delete)[^;]*on public\.(?:orders|products|product_images|product_variants|storefront_settings) to authenticated/i,
    );
    expect(sql).not.toMatch(/to anon\b/i);
    expect(sql).not.toMatch(/alter publication supabase_realtime add table public\.(orders|products)/i);
  });

  it("creates the product image bucket with explicit storage policies", async () => {
    const sql = await readFile(baselinePath, "utf8");

    expect(sql).toContain("'product-images'");
    expect(sql).toMatch(/on storage\.objects/i);
    expect(sql).toMatch(/bucket_id = 'product-images'/i);
    expect(sql).not.toMatch(/create unique index product_images_one_primary_idx/i);
  });

  it("keeps Shopify order ids optional for manually created orders", async () => {
    const sql = await readFile(baselinePath, "utf8");

    expect(sql).toMatch(/shopify_order_id bigint(?:\s*,|\s*\n)/i);
    expect(sql).toMatch(/where shopify_order_id is not null/i);
  });

  it("reconciles an already-provisioned project without deleting data", async () => {
    const sql = await readFile(baselinePath, "utf8");

    expect(sql).toMatch(/create table if not exists public\.orders/i);
    expect(sql).toMatch(/add column if not exists courier_name text/i);
    expect(sql).toMatch(/add column if not exists created_at timestamptz/i);
    expect(sql).not.toMatch(/\b(?:drop|truncate)\s+table\b/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
  });
});
