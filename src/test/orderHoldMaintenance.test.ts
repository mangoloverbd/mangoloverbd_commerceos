import { describe, expect, it, vi } from "vitest";
import { releaseDueOrderHolds } from "../../server/orderHoldMaintenance.js";

type HoldRow = {
  id: string;
  org_id: string;
  status: string;
  hold_reason_code: string | null;
  hold_reason_detail: string | null;
  hold_until_date: string | null;
};

function createSupabase(initialRows: HoldRow[]) {
  const rows = initialRows.map((row) => ({ ...row }));
  const queries: Array<{ table: string; operation: string; filters: Record<string, unknown>; patch?: unknown; range?: [number, number] }> = [];

  const supabase = {
    from(table: string) {
      const query: (typeof queries)[number] = { table, operation: "select", filters: {} };
      queries.push(query);
      const builder = {
        select() {
          return builder;
        },
        update(patch: unknown) {
          query.operation = "update";
          query.patch = patch;
          return builder;
        },
        eq(column: string, value: unknown) {
          query.filters[column] = value;
          return builder;
        },
        in(column: string, values: unknown[]) {
          query.filters[column] = values;
          return builder;
        },
        not(column: string, operator: string, value: unknown) {
          query.filters[`${column}:${operator}`] = value;
          return builder;
        },
        lt(column: string, value: unknown) {
          query.filters[`${column}:lt`] = value;
          return builder;
        },
        range(from: number, to: number) {
          query.range = [from, to];
          return builder;
        },
        order() {
          return builder;
        },
        maybeSingle() {
          const match = rows.find((row) => {
            const { id, org_id, status, "hold_until_date:lt": beforeDate } = query.filters;
            const validStatus = Array.isArray(status) ? status.includes(row.status) : status === row.status;
            return row.id === id && row.org_id === org_id && validStatus
              && typeof beforeDate === "string" && row.hold_until_date !== null
              && row.hold_until_date < beforeDate;
          });
          if (!match) return Promise.resolve({ data: null, error: null });
          Object.assign(match, query.patch);
          return Promise.resolve({ data: { ...match }, error: null });
        },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          const result = rows.filter((row) => {
            const { org_id, status, "hold_until_date:lt": beforeDate } = query.filters;
            const validStatus = Array.isArray(status) ? status.includes(row.status) : status === row.status;
            return row.org_id === org_id && validStatus
              && typeof beforeDate === "string" && row.hold_until_date !== null
              && row.hold_until_date < beforeDate;
          });
          const [from = 0, to = result.length - 1] = query.range || [];
          return Promise.resolve({ data: result.slice(from, to + 1).map((row) => ({ ...row })), error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };

  return { supabase, rows, queries };
}

const dueHold: HoldRow = {
  id: "order-due",
  org_id: "mango-workspace",
  status: "on_hold",
  hold_reason_code: "customer_requested_after_date",
  hold_reason_detail: null,
  hold_until_date: "2026-09-25",
};

describe("releaseDueOrderHolds", () => {
  it("releases a due hold conditionally and records the same reason/date as system activity", async () => {
    const { supabase, rows, queries } = createSupabase([dueHold]);
    const recordStatusEvent = vi.fn(async () => true);
    const recordOrderActivity = vi.fn(async () => ({ recorded: true, id: "activity-1" }));

    const released = await releaseDueOrderHolds({
      supabase,
      orgId: "mango-workspace",
      todayInDhaka: "2026-09-26",
      now: new Date("2026-09-26T03:15:00.000Z"),
      recordStatusEvent,
      recordOrderActivity,
    });

    expect(released).toBe(1);
    expect(rows[0]).toMatchObject({ status: "pending", hold_reason_code: dueHold.hold_reason_code, hold_until_date: dueHold.hold_until_date });
    expect(queries.every((query) => query.filters.org_id === "mango-workspace")).toBe(true);
    expect(queries[1]).toMatchObject({ operation: "update", patch: { status: "pending" } });
    expect(queries[1]?.filters).toMatchObject({ id: "order-due", status: ["on_hold", "hold"], "hold_until_date:lt": "2026-09-26" });
    expect(recordStatusEvent).toHaveBeenCalledWith(supabase, expect.objectContaining({
      from_status: "on_hold",
      to_status: "pending",
      actor_kind: "system",
    }));
    expect(recordOrderActivity).toHaveBeenCalledWith(supabase, expect.objectContaining({
      event_type: "order.status_changed",
      reason_code: dueHold.hold_reason_code,
      metadata: expect.objectContaining({ hold_until_date: dueHold.hold_until_date }),
      actor_kind: "system",
    }));
  });

  it("ignores unscheduled, not-yet-due, and non-hold rows", async () => {
    const { supabase, rows } = createSupabase([
      dueHold,
      { ...dueHold, id: "risk-hold", hold_reason_code: null, hold_until_date: null },
      { ...dueHold, id: "future-hold", hold_until_date: "2026-09-26" },
      { ...dueHold, id: "released-before-run", status: "pending" },
    ]);
    const recordStatusEvent = vi.fn();
    const recordOrderActivity = vi.fn();

    const released = await releaseDueOrderHolds({
      supabase,
      orgId: "mango-workspace",
      todayInDhaka: "2026-09-26",
      now: new Date("2026-09-26T03:15:00.000Z"),
      recordStatusEvent,
      recordOrderActivity,
    });

    expect(released).toBe(1);
    expect(rows.find((row) => row.id === "risk-hold")?.status).toBe("on_hold");
    expect(rows.find((row) => row.id === "future-hold")?.status).toBe("on_hold");
    expect(rows.find((row) => row.id === "released-before-run")?.status).toBe("pending");
    expect(recordStatusEvent).toHaveBeenCalledTimes(1);
    expect(recordOrderActivity).toHaveBeenCalledTimes(1);
  });

  it("does not record events when another update wins the conditional status check", async () => {
    const { supabase, rows } = createSupabase([dueHold]);
    const recordStatusEvent = vi.fn();
    const recordOrderActivity = vi.fn();
    rows[0]!.status = "confirmed";

    const released = await releaseDueOrderHolds({
      supabase,
      orgId: "mango-workspace",
      todayInDhaka: "2026-09-26",
      now: new Date("2026-09-26T03:15:00.000Z"),
      recordStatusEvent,
      recordOrderActivity,
    });

    expect(released).toBe(0);
    expect(recordStatusEvent).not.toHaveBeenCalled();
    expect(recordOrderActivity).not.toHaveBeenCalled();
  });

  it("is idempotent across repeated cron runs", async () => {
    const { supabase } = createSupabase([dueHold]);
    const recordStatusEvent = vi.fn(async () => true);
    const recordOrderActivity = vi.fn(async () => ({ recorded: true, id: "activity-1" }));
    const options = {
      supabase,
      orgId: "mango-workspace",
      todayInDhaka: "2026-09-26",
      now: new Date("2026-09-26T03:15:00.000Z"),
      recordStatusEvent,
      recordOrderActivity,
    };

    await expect(releaseDueOrderHolds(options)).resolves.toBe(1);
    await expect(releaseDueOrderHolds(options)).resolves.toBe(0);
    expect(recordStatusEvent).toHaveBeenCalledTimes(1);
    expect(recordOrderActivity).toHaveBeenCalledTimes(1);
  });
});
