import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260918000000_staff_attribution.sql",
);
const baselineVerifierPath = resolve(
  process.cwd(),
  "scripts/verify-supabase-baseline.mjs",
);

function alterTableBlock(sql: string, table: string) {
  const match = sql.match(
    new RegExp(`alter table public\\.${table}\\s+([\\s\\S]*?);`, "i"),
  );
  return match?.[0] || "";
}

describe("staff attribution schema", () => {
  it("adds nullable attribution columns to both order tables", async () => {
    const sql = await readFile(migrationPath, "utf8");

    for (const table of ["orders", "social_inbox_orders"]) {
      const alteration = alterTableBlock(sql, table);

      for (const column of [
        "created_by",
        "assigned_to",
        "confirmed_by",
        "cancelled_by",
      ]) {
        expect(alteration).toMatch(
          new RegExp(`add column if not exists ${column} uuid`, "i"),
        );
        expect(alteration).not.toMatch(
          new RegExp(`add column if not exists ${column} uuid[^,;]*not null`, "i"),
        );
      }

      expect(alteration).toMatch(/add column if not exists confirmed_at timestamptz/i);
      expect(alteration).toMatch(/add column if not exists cancelled_at timestamptz/i);
    }
  });

  it("never backfills attribution on existing rows", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).not.toMatch(/update public\.orders\s+set\s+(created_by|confirmed_by)/i);
    expect(sql).not.toMatch(
      /update public\.social_inbox_orders\s+set\s+(created_by|confirmed_by)/i,
    );
  });

  it("creates a workspace-scoped append-only status event log", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/create table if not exists public\.order_status_events/i);
    expect(sql).toMatch(/org_id uuid not null/i);
    expect(sql).toMatch(/order_id uuid not null/i);
    expect(sql).toMatch(/order_table text not null/i);
    expect(sql).toMatch(
      /check \(order_table in \('orders', 'social_inbox_orders'\)\)/i,
    );
    expect(sql).toMatch(/actor_kind text not null/i);
    expect(sql).toMatch(
      /check \(actor_kind in \('user', 'courier_webhook', 'system'\)\)/i,
    );
    expect(sql).toMatch(/to_status text not null/i);
  });

  it("indexes report lookups and attribution foreign keys", async () => {
    const sql = await readFile(migrationPath, "utf8");

    for (const index of [
      "orders_org_confirmed_by_idx",
      "orders_org_assigned_to_idx",
      "social_inbox_orders_org_confirmed_by_idx",
      "social_inbox_orders_org_assigned_to_idx",
      "order_status_events_org_order_idx",
      "order_status_events_org_actor_idx",
      "order_status_events_actor_id_idx",
      "orders_created_by_idx",
      "orders_assigned_to_idx",
      "orders_confirmed_by_idx",
      "orders_cancelled_by_idx",
      "social_inbox_orders_created_by_idx",
      "social_inbox_orders_assigned_to_idx",
      "social_inbox_orders_confirmed_by_idx",
      "social_inbox_orders_cancelled_by_idx",
    ]) {
      expect(sql).toMatch(new RegExp(`create index if not exists ${index}`, "i"));
    }
  });

  it("keeps former staff names while indexing active rosters and cancellation reports", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(
      /alter table public\.user_roles\s+add column if not exists deleted_at timestamptz/i,
    );
    expect(sql).toMatch(
      /create index if not exists user_roles_active_org_idx[\s\S]*?where deleted_at is null/i,
    );
    expect(sql).toMatch(
      /create index if not exists orders_org_cancelled_by_idx[\s\S]*?\(org_id, cancelled_by, cancelled_at desc\)[\s\S]*?where cancelled_by is not null/i,
    );
    expect(sql).toMatch(
      /create index if not exists social_inbox_orders_org_cancelled_by_idx[\s\S]*?\(org_id, cancelled_by, cancelled_at desc\)[\s\S]*?where cancelled_by is not null/i,
    );
  });

  it("includes the former-staff marker in the baseline runtime contract", async () => {
    const verifier = await readFile(baselineVerifierPath, "utf8");

    expect(verifier).toContain("('user_roles', 'deleted_at')");
  });

  it("keeps the event log server-only and adds staff display names", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/alter table public\.order_status_events enable row level security/i);
    expect(sql).toMatch(
      /revoke all on table public\.order_status_events from anon, authenticated/i,
    );
    expect(sql).toMatch(/grant all on public\.order_status_events to service_role/i);
    expect(sql).not.toMatch(/grant .* on public\.order_status_events to (anon|authenticated)/i);
    expect(sql).toMatch(
      /alter table public\.user_roles\s+add column if not exists display_name text/i,
    );
  });

  it("is transactional and idempotent", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql.indexOf("begin;")).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf("begin;")).toBeLessThan(sql.indexOf("alter table"));
    expect(sql.trim().endsWith("commit;")).toBe(true);
    expect(sql.match(/create table (?!if not exists)/gi)).toBeNull();
  });
});
