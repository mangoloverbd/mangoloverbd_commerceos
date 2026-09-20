import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260919000000_fraud_checks_cache.sql",
);

describe("fraud_checks schema", () => {
  it("creates a service-role-only, workspace-scoped phone cache", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/create table if not exists public\.fraud_checks/i);
    expect(sql).toMatch(/org_id uuid not null/i);
    expect(sql).toMatch(/phone text not null check \(phone ~ '\^01\[0-9\]\{9\}\$'\)/i);
    expect(sql).toMatch(/status text not null check \(status in \('pending', 'ok', 'error'\)\)/i);
    expect(sql).toMatch(/payload jsonb check \(payload is null or jsonb_typeof\(payload\) = 'object'\)/i);
    expect(sql).toMatch(/summary jsonb check \(summary is null or jsonb_typeof\(summary\) = 'object'\)/i);
    expect(sql).toMatch(/unique \(org_id, phone\)/i);
    expect(sql).toMatch(/create index if not exists fraud_checks_org_checked_at_idx/i);
  });

  it("never exposes the cache to browser roles", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/alter table public\.fraud_checks enable row level security/i);
    expect(sql).toMatch(/revoke all on public\.fraud_checks from anon, authenticated/i);
    expect(sql).toMatch(/grant all on public\.fraud_checks to service_role/i);
  });

  it("wraps the change in a transaction and keeps updated_at maintained", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql.trim().startsWith("begin;") || sql.includes("\nbegin;")).toBe(true);
    expect(sql).toMatch(/commit;/i);
    expect(sql).toMatch(/create trigger update_fraud_checks_updated_at/i);
    expect(sql).toMatch(/execute function public\.update_updated_at_column\(\)/i);
  });
});
