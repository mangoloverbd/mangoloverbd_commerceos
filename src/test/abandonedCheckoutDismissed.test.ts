import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  autoDismissAlreadyOrderedCheckouts,
  canTransitionAbandonedCheckout,
  dismissedCheckoutSearchPattern,
  loadDismissedAbandonedCheckouts,
  resolveAbandonedStaffAction,
} from "../../server/abandonedCheckouts.js";
import { buildStatusEvent } from "../../server/orderAttribution.js";
import { memorySupabase } from "./helpers/memorySupabase";

const ORG = "org-mango";
const OTHER_ORG = "org-other";
const NOW = new Date("2026-11-09T09:00:00.000Z");
const FUTURE = "2026-12-01T00:00:00.000Z";
const PAST = "2026-11-01T00:00:00.000Z";

function checkout(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    org_id: ORG,
    status: "dismissed",
    resolution: "dismissed",
    customer_name: "Customer",
    phone: "01711000000",
    address: "Dhaka",
    created_at: "2026-11-01T00:00:00.000Z",
    resolved_at: "2026-11-05T00:00:00.000Z",
    expires_at: FUTURE,
    ...overrides,
  };
}

describe("dismissed abandoned checkout list", () => {
  const tables = () => ({
    abandoned_checkouts: [
      checkout({ id: "older", customer_name: "Rina", resolved_at: "2026-11-02T00:00:00.000Z" }),
      checkout({ id: "newest", customer_name: "Karim", phone: "01822333444", resolved_at: "2026-11-08T00:00:00.000Z" }),
      checkout({ id: "auto", customer_name: "Auto", resolution: "already_ordered", resolved_at: "2026-11-06T00:00:00.000Z" }),
      checkout({ id: "expired", expires_at: PAST }),
      checkout({ id: "other-workspace", org_id: OTHER_ORG, resolved_at: "2026-11-09T00:00:00.000Z" }),
      checkout({ id: "active", status: "open", resolution: null, resolved_at: null }),
    ],
    order_status_events: [
      { org_id: ORG, order_id: "newest", order_table: "abandoned_checkouts", to_status: "dismissed", actor_id: "u-old", actor_kind: "user", created_at: "2026-11-03T00:00:00.000Z" },
      { org_id: ORG, order_id: "newest", order_table: "abandoned_checkouts", to_status: "dismissed", actor_id: "u-rahim", actor_kind: "user", created_at: "2026-11-08T00:00:00.000Z" },
      { org_id: ORG, order_id: "auto", order_table: "abandoned_checkouts", to_status: "dismissed", actor_id: null, actor_kind: "system", created_at: "2026-11-06T00:00:00.000Z" },
    ],
    user_roles: [
      { org_id: ORG, user_id: "u-rahim", display_name: "Rahim" },
      { org_id: ORG, user_id: "u-old", display_name: "Old Staff" },
    ],
  });

  it("returns only this workspace's unexpired dismissed checkouts, newest dismissal first, with who dismissed them", async () => {
    const supabase = memorySupabase(tables());
    const rows = await loadDismissedAbandonedCheckouts(supabase, { orgId: ORG, fields: "*", now: NOW });

    expect(rows.map((row) => row.id)).toEqual(["newest", "auto", "older"]);
    expect(rows[0].dismissed_by).toBe("Rahim");
    expect(rows[1].dismissed_by).toBeNull();
    expect(rows[2].dismissed_by).toBeNull();
  });

  it("searches every unexpired dismissed checkout by name, phone and address", async () => {
    const supabase = memorySupabase(tables());

    const byName = await loadDismissedAbandonedCheckouts(supabase, { orgId: ORG, fields: "*", search: "rina", now: NOW });
    expect(byName.map((row) => row.id)).toEqual(["older"]);

    const byPhone = await loadDismissedAbandonedCheckouts(supabase, { orgId: ORG, fields: "*", search: "+880 1822-333444", now: NOW });
    expect(byPhone.map((row) => row.id)).toEqual(["newest"]);
  });

  it("strips characters that would break the PostgREST filter from the search", () => {
    expect(dismissedCheckoutSearchPattern("  a,b(c)%*  ")).toBe("%a b c%");
    expect(dismissedCheckoutSearchPattern("   ")).toBeNull();
  });
});

describe("abandoned checkout staff transitions", () => {
  const STATUSES = ["open", "contacted", "dismissed", "recovered", "expired"];
  const ACTIONS = ["open", "contacted", "dismissed"];
  const ALLOWED = new Set(["open>contacted", "open>dismissed", "contacted>dismissed", "contacted>open", "dismissed>open"]);

  it("allows only the listed transitions and refuses every other one with 409", () => {
    for (const status of STATUSES) {
      for (const action of ACTIONS) {
        const result = resolveAbandonedStaffAction({ status, resolution: status === "dismissed" ? "dismissed" : null }, action, NOW);
        const key = `${status}>${action}`;
        expect(canTransitionAbandonedCheckout(status, action, "staff"), key).toBe(ALLOWED.has(key));
        if (ALLOWED.has(key)) expect(result.patch, key).toBeTruthy();
        else expect(result, key).toEqual({ error: 409 });
      }
    }
  });

  it("does not let a dismissed checkout be marked contacted", () => {
    expect(resolveAbandonedStaffAction({ status: "dismissed", resolution: "dismissed" }, "contacted", NOW)).toEqual({ error: 409 });
  });

  it("restores a dismissed checkout as a fresh open checkout", () => {
    expect(resolveAbandonedStaffAction({ status: "dismissed", resolution: "already_ordered" }, "open", NOW)).toEqual({
      patch: { status: "open", contacted_at: null, resolved_at: null, resolution: null },
    });
  });

  it("dismisses with the time and resolution", () => {
    expect(resolveAbandonedStaffAction({ status: "open", resolution: null }, "dismissed", NOW)).toEqual({
      patch: { status: "dismissed", resolved_at: NOW.toISOString(), resolution: "dismissed" },
    });
  });

  it("keeps Order Protection rejections dismissed", () => {
    expect(resolveAbandonedStaffAction({ status: "dismissed", resolution: "rejected_in_order_protection" }, "open", NOW)).toEqual({ error: 409 });
  });
});

describe("already-ordered auto-dismiss", () => {
  it("dismisses active checkouts whose phone has a Pending order and records a system status event", async () => {
    const tables = {
      abandoned_checkouts: [
        checkout({ id: "has-pending", status: "open", resolution: null, resolved_at: null, phone: "01711000001" }),
        checkout({ id: "has-shipped", status: "contacted", resolution: null, resolved_at: null, phone: "01711000002" }),
        checkout({ id: "no-order", status: "open", resolution: null, resolved_at: null, phone: "01711000003" }),
      ],
      orders: [
        { id: "o1", org_id: ORG, phone: "01711000001", status: "pending" },
        { id: "o2", org_id: ORG, phone: "01711000002", status: "shipped" },
        { id: "o3", org_id: OTHER_ORG, phone: "01711000003", status: "pending" },
      ],
      order_status_events: [] as Record<string, unknown>[],
    };
    const supabase = memorySupabase(tables);
    const recordStatusEvent = vi.fn(async (client: typeof supabase, event: Record<string, unknown> | null) => {
      if (event) await client.from("order_status_events").insert(event);
      return true;
    });

    const dismissed = await autoDismissAlreadyOrderedCheckouts(supabase, {
      orgId: ORG,
      checkouts: tables.abandoned_checkouts.map((row) => ({ ...row })),
      classifyOrderStatus: (order: { status: string }) => order.status,
      recordStatusEvent,
      buildStatusEvent,
      now: NOW,
    });

    expect(dismissed).toEqual(["has-pending"]);
    expect(tables.abandoned_checkouts.find((row) => row.id === "has-pending")).toMatchObject({
      status: "dismissed",
      resolution: "already_ordered",
      resolved_at: NOW.toISOString(),
    });
    expect(tables.abandoned_checkouts.find((row) => row.id === "no-order")?.status).toBe("open");
    expect(tables.order_status_events).toEqual([
      expect.objectContaining({ order_id: "has-pending", from_status: "open", to_status: "dismissed", actor_kind: "system", actor_id: null }),
    ]);
  });
});

describe("dismissed checkout route wiring", () => {
  const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
  const section = (start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

  it("guards the dismissed list with auth and the workspace", () => {
    const route = section('app.get("/api/abandoned-checkouts/dismissed"', 'app.patch("/api/abandoned-checkouts/:id"');
    expect(route).toContain("getUser(token)");
    expect(route).toContain('status(401)');
    expect(route).toContain("getUserOrg(supabase, user.id)");
    expect(route).toContain("loadDismissedAbandonedCheckouts(supabase, {");
  });

  it("lets status actions reach dismissed checkouts but keeps edits to active ones", () => {
    const route = section('app.patch("/api/abandoned-checkouts/:id"', "async function resolveAbandonedCatalogIds");
    expect(route).toContain('hasAction ? [...ACTIVE_ABANDONED_CHECKOUT_STATUSES, "dismissed"] : ACTIVE_ABANDONED_CHECKOUT_STATUSES');
    expect(route).toContain("resolveAbandonedStaffAction(current, action, now)");
    expect(route).toContain('.eq("status", current.status)');
    expect(route).toContain("recordStatusEvent(supabase, buildStatusEvent({");
  });

  it("scrubs contact details from expired dismissed checkouts", () => {
    const maintenance = section("async function runAbandonedCheckoutMaintenance", 'app.get("/api/internal/abandoned-checkouts-maintenance"');
    expect(maintenance).toContain('.in("status", ["dismissed", "recovered", "expired"])');
    expect(maintenance).toContain("buildPersonalDataScrubPatch()");
  });
});
