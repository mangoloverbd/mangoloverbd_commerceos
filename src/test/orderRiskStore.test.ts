import { describe, expect, it } from "vitest";
import {
  insertRiskAttempt, linkAttemptToOrder, linkAttemptToReview, listRiskAttempts,
  getRiskAttempt, listRelatedAttempts, findListHits, createListEntries,
  listListEntries, deleteListEntry, labelRiskAttempt, scrubExpiredRiskAttempts,
} from "../../server/risk/store.js";

const orgId = "20000000-0000-0000-0000-000000000001";
const id = "30000000-0000-0000-0000-000000000001";
const other = "30000000-0000-0000-0000-000000000002";
const hash = "a".repeat(64);

function mockSupabase(results: Array<{ data?: unknown; error?: Error | null; count?: number }> = []) {
  const queries: Array<{ table: string; calls: Array<[string, ...unknown[]]> }> = [];
  const supabase = {
    from(table: string) {
      const query = { table, calls: [] as Array<[string, ...unknown[]]> };
      queries.push(query);
      const chain: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ["select", "insert", "update", "upsert", "delete", "eq", "in", "or", "not", "lt", "gte", "order", "limit", "maybeSingle", "single"]) {
        chain[method] = (...args: unknown[]) => {
          query.calls.push([method, ...args]);
          return chain;
        };
      }
      chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(results.shift() ?? { data: [], error: null, count: 0 }).then(resolve, reject);
      return chain;
    },
  };
  return { supabase, queries };
}

function guarded(queries: ReturnType<typeof mockSupabase>["queries"]) {
  expect(queries.length).toBeGreaterThan(0);
  for (const query of queries) expect(query.calls).toContainEqual(["eq", "org_id", orgId]);
}

describe("risk store", () => {
  it("inserts a scoped attempt and links an order and a review", async () => {
    const { supabase, queries } = mockSupabase([
      { data: { id } }, { data: { id } }, { data: { id: other } },
      { data: { id } }, { data: { id } }, { data: { id: other } }, { data: { id } },
    ]);
    expect(await insertRiskAttempt(supabase, { org_id: orgId, route: "public_v1", mode: "shadow", decision: "HOLD", score: 40, expires_at: "2026-10-23T00:00:00.000Z" })).toEqual({ id });
    await linkAttemptToOrder(supabase, { orgId, attemptId: id, orderId: other });
    await linkAttemptToReview(supabase, { orgId, attemptId: id, reviewId: other });
    expect(queries[0].calls).toContainEqual(["insert", expect.objectContaining({ org_id: orgId })]);
    guarded(queries.slice(1));
    expect(queries.some(q => q.table === "orders" && q.calls.some(c => c[0] === "update" && (c[1] as { risk_attempt_id: string }).risk_attempt_id === id))).toBe(true);
    expect(queries.some(q => q.table === "order_protection_reviews" && q.calls.some(c => c[0] === "update" && (c[1] as { attempt_id: string }).attempt_id === id))).toBe(true);
  });

  it("validates filtered pagination and gets only scoped attempts", async () => {
    const { supabase, queries } = mockSupabase([{ data: [] }, { data: { id } }]);
    await listRiskAttempts(supabase, { orgId, decision: "hold", limit: 10, before: "2026-09-23T00:00:00Z" });
    expect(queries[0].calls).toContainEqual(["eq", "decision", "HOLD"]);
    expect(queries[0].calls).toContainEqual(["lt", "created_at", "2026-09-23T00:00:00.000Z"]);
    expect(await getRiskAttempt(supabase, { orgId, attemptId: id })).toEqual({ id });
    guarded(queries);
    await expect(listRiskAttempts(supabase, { orgId, decision: "BLOCK" })).rejects.toThrow();
    await expect(listRiskAttempts(supabase, { orgId, limit: 101 })).rejects.toThrow();
    await expect(getRiskAttempt(supabase, { orgId, attemptId: "bad" })).rejects.toThrow();
  });

  it("finds related activity and validates identity filters", async () => {
    const { supabase, queries } = mockSupabase([{ data: [] }]);
    await listRelatedAttempts(supabase, { orgId, attempt: { id, phone_hash: hash, device_hash: null, fingerprint_hash: hash }, days: 7, limit: 5 });
    guarded(queries);
    expect(queries[0].calls).toContainEqual(["or", `phone_hash.eq.${hash},fingerprint_hash.eq.${hash}`]);
    await expect(listRelatedAttempts(supabase, { orgId, attempt: { id, phone_hash: "bad" } })).rejects.toThrow();
  });

  it("uses active hashed list entries and upserts staff decisions", async () => {
    const { supabase, queries } = mockSupabase([
      { data: [{ list: "block", kind: "phone", value_hash: hash }, { list: "allow", kind: "device", value_hash: hash }] },
      { data: [{ id }] }, { data: [] }, { data: { id } },
    ]);
    expect(await findListHits(supabase, { orgId, hashes: { phone: hash, device: hash } })).toEqual({ block: ["phone"], allow: ["device"] });
    await createListEntries(supabase, { orgId, list: "block", entries: [{ kind: "phone", value_hash: hash, display_hint: "017••••448" }], reason: "Staff confirmed fake", sourceAttemptId: id, createdBy: other });
    await listListEntries(supabase, { orgId, list: "block" });
    await deleteListEntry(supabase, { orgId, entryId: id });
    guarded(queries);
    expect(queries[1].calls).toContainEqual(["upsert", expect.arrayContaining([expect.objectContaining({ org_id: orgId, kind: "phone" })]), { onConflict: "org_id,list,kind,value_hash" }]);
    await expect(findListHits(supabase, { orgId, hashes: { phone: "raw-phone" } })).rejects.toThrow();
  });

  it("labels and scrubs personal data after 30 days, deleting old rows", async () => {
    const { supabase, queries } = mockSupabase([{ data: { id } }, { count: 2 }, { count: 1 }]);
    await labelRiskAttempt(supabase, { orgId, attemptId: id, label: "fake" });
    expect(await scrubExpiredRiskAttempts(supabase, { now: new Date("2026-09-23T00:00:00Z") })).toEqual({ scrubbed: 2, deleted: 1 });
    guarded(queries.slice(0, 1));
    expect(queries[1].calls).toContainEqual(["update", expect.objectContaining({ customer_name: null, phone: null, address: null, ip_prefix: null, items: [] }), { count: "exact" }]);
    expect(queries[2].calls).toContainEqual(["lt", "created_at", "2026-03-27T00:00:00.000Z"]);
  });

  it("propagates database errors", async () => {
    const { supabase } = mockSupabase([{ error: new Error("database unavailable") }]);
    await expect(getRiskAttempt(supabase, { orgId, attemptId: id })).rejects.toThrow("database unavailable");
  });
});
