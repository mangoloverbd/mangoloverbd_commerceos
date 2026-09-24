import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = () => readFileSync(resolve(process.cwd(), "supabase/migrations/20260924000000_order_risk_engine_v2.sql"), "utf8");
const baseline = () => readFileSync(resolve(process.cwd(), "scripts/verify-supabase-baseline.mjs"), "utf8");

describe("risk engine schema", () => {
  it("creates private, transactional, constrained tables", () => {
    const sql = migration();
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
    for (const table of ["order_risk_attempts", "order_risk_list_entries"]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${table} from anon, authenticated`, "i"));
      expect(sql).toMatch(new RegExp(`grant all on public\\.${table} to service_role`, "i"));
    }
    for (const column of ["phone_hash", "device_hash", "fingerprint_hash", "network_hash", "ip_hash", "user_agent_hash"]) {
      expect(sql).toContain(`${column} text null check (${column} ~ '^[0-9a-f]{64}$')`);
    }
    expect(sql).toContain("jsonb_typeof(signals) = 'array'");
    expect(sql).toContain("jsonb_typeof(items) = 'array'");
    expect(sql).toContain("expires_at timestamptz not null default (now() + interval '30 days')");
    expect(sql).toContain("unique (org_id, list, kind, value_hash)");
    expect(sql).toContain("value_hash ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("add column if not exists risk_attempt_id uuid");
    expect(sql).toContain("add column if not exists attempt_id uuid");
    expect(sql).toMatch(/references public\.order_risk_attempts\(id\) on delete set null/);
    for (const fragment of ["(org_id, created_at desc)", "(org_id, decision, created_at desc)",
      "(org_id, phone_hash)", "(org_id, device_hash)", "(org_id, fingerprint_hash)",
      "(org_id, network_hash)", "(org_id, order_id)", "where order_id is not null",
      "(expires_at)", "(org_id, list, created_at desc)", "where risk_attempt_id is not null"])
      expect(sql).toContain(fragment);
    expect(sql).not.toMatch(/grant\s+.*\s+to\s+(anon|authenticated)\b/i);
  });

  it("updates the local baseline runtime table and link-column contract", () => {
    const script = baseline();
    expect(script).toContain('"order_risk_attempts"');
    expect(script).toContain('"order_risk_list_entries"');
    expect(script).toContain("('orders', 'risk_attempt_id')");
    expect(script).toContain("('order_protection_reviews', 'attempt_id')");
  });

  it("adds a private raw IP column to risk attempts", () => {
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260924120000_order_risk_attempts_ip_address.sql"), "utf8");
    expect(sql).toMatch(/^begin;$/m);
    expect(sql.trim().endsWith("commit;")).toBe(true);
    expect(sql).toContain("alter table public.order_risk_attempts");
    expect(sql).toContain("add column if not exists ip_address inet");
    expect(sql).not.toMatch(/grant\s+.*\s+to\s+(anon|authenticated)\b/i);
  });
});
