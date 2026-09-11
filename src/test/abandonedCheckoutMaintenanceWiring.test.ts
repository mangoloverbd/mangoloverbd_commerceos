import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911000000_add_abandoned_checkouts.sql"),
  "utf8",
);
const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const vercel = readFileSync(resolve(process.cwd(), "vercel.json"), "utf8");

function section(startMarker: string, endMarker: string) {
  const start = server.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = server.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return server.slice(start, end);
}

describe("abandoned checkout maintenance", () => {
  it("ships a service-role-only, workspace-scoped reconciliation function", () => {
    expect(migration).toMatch(/create or replace function public\.reconcile_abandoned_checkouts\(p_org_id uuid\)/i);
    expect(migration).toMatch(/where o\.org_id = p_org_id/i);
    expect(migration).toMatch(/where ac\.org_id = p_org_id/i);
    expect(migration).toMatch(/revoke all on function public\.reconcile_abandoned_checkouts\(uuid\) from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.reconcile_abandoned_checkouts\(uuid\) to service_role/i);
  });

  it("authenticates its daily route before reconciling and scrubbing all due drafts", () => {
    const worker = section(
      "async function runAbandonedCheckoutMaintenance",
      'app.get("/api/internal/abandoned-checkouts-maintenance"',
    );
    const maintenance = section(
      'app.get("/api/internal/abandoned-checkouts-maintenance"',
      "// Apex (<=2 labels",
    );

    expect(maintenance).toContain("isAuthorizedCronRequest(req.headers.authorization, process.env.CRON_SECRET)");
    expect(maintenance).toContain("runAbandonedCheckoutMaintenance");
    expect(worker).toContain('rpc("reconcile_abandoned_checkouts"');
    expect(worker).toContain("buildExpiryPatch");
    expect(worker).toContain("buildPersonalDataScrubPatch");
    expect(worker).toContain('in("status", ACTIVE_ABANDONED_CHECKOUT_STATUSES)');
    expect(worker).toContain('.in("status", ["dismissed", "recovered", "expired"])');
    expect(worker).toContain('.lte("expires_at", now.toISOString())');
    expect(vercel).toContain('"/api/internal/abandoned-checkouts-maintenance"');
  });
});
