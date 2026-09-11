import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260911000000_add_abandoned_checkouts.sql",
);
const baselinePath = resolve(
  process.cwd(),
  "supabase/migrations/20260828000000_canonical_schema_reconciliation.sql",
);

describe("abandoned checkout schema", () => {
  it("creates a service-role-only, workspace-scoped recovery table and late-order linkage", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/create table if not exists public\.abandoned_checkouts/i);
    expect(sql).toMatch(/unique\s*\(org_id,\s*draft_key\)/i);
    expect(sql).toMatch(/unique\s*\(id,\s*org_id\)/i);
    expect(sql).toMatch(/status text not null default 'open'/i);
    expect(sql).toMatch(/status in \('open', 'contacted', 'dismissed', 'recovered', 'expired'\)/i);
    expect(sql).toMatch(/source = 'storefront'\s+and source_path = '\/checkout'/i);
    expect(sql).toMatch(/expires_at timestamptz not null/i);
    expect(sql).toMatch(/create index if not exists abandoned_checkouts_org_status_expires_idx/i);
    expect(sql).toMatch(/create index if not exists abandoned_checkouts_org_created_idx/i);
    expect(sql).toMatch(/add column if not exists abandoned_checkout_id uuid/i);
    expect(sql).toMatch(/add column if not exists abandoned_draft_key_hash text/i);
    expect(sql).toMatch(/foreign key \(abandoned_checkout_id, org_id\)\s+references public\.abandoned_checkouts \(id, org_id\)/i);
    expect(sql).toMatch(/create index if not exists orders_org_abandoned_draft_key_hash_idx/i);
    expect(sql).toMatch(/alter table public\.abandoned_checkouts enable row level security/i);
    expect(sql).toMatch(/revoke all on public\.abandoned_checkouts from anon, authenticated/i);
    expect(sql).toMatch(/grant all on public\.abandoned_checkouts to service_role/i);
    expect(sql).toMatch(/revoke all on function public\.abandoned_checkout_preserve_expiry\(\) from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.abandoned_checkout_preserve_expiry\(\) to service_role/i);
  });

  it("keeps a fresh canonical baseline complete without granting browser access", async () => {
    const sql = await readFile(baselinePath, "utf8");

    expect(sql).toMatch(/create table if not exists public\.abandoned_checkouts/i);
    expect(sql).toMatch(/alter table public\.abandoned_checkouts enable row level security/i);
    expect(sql).toMatch(/add column if not exists abandoned_checkout_id uuid/i);
    expect(sql).toMatch(/add column if not exists abandoned_draft_key_hash text/i);
    expect(sql).not.toMatch(/grant\s+(?:select|insert|update|delete)[^;]*on public\.abandoned_checkouts to authenticated/i);
    expect(sql).not.toMatch(/create policy[^;]*on public\.abandoned_checkouts/i);
  });
});
