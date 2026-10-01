import { describe, expect, it } from "vitest";
import {
  buildStaffReport,
  calculateRetainedUpsells,
  classifyCourierOutcome,
  resolveStaffReportRequest,
  toDhakaInterval,
} from "../../server/reports.js";

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const TEAM_MEMBER_ID = "22222222-2222-2222-2222-222222222222";
const NO_OUTCOMES = {
  delivered_packs: 0, delivered_kg: 0, returned_packs: 0, returned_kg: 0, cancelled_packs: 0, cancelled_kg: 0,
};

describe("calculateRetainedUpsells", () => {
  it("credits upsell additions and removes value retained no longer in the order", () => {
    const result = calculateRetainedUpsells([
      {
        id: "add",
        order_id: "order-1",
        actor_id: TEAM_MEMBER_ID,
        created_at: "2026-09-18T03:00:00.000Z",
        changes: [{
          type: "item_quantity_increased",
          item_key: "mango:large",
          quantity_delta: 3,
          amount_delta: 900,
          addition_reason: "upsell",
        }],
      },
      {
        id: "reduce",
        order_id: "order-1",
        actor_id: ADMIN_ID,
        created_at: "2026-09-18T04:00:00.000Z",
        changes: [{
          type: "item_quantity_decreased",
          item_key: "mango:large",
          quantity_delta: -1,
          amount_delta: -300,
        }],
      },
      {
        id: "discount",
        order_id: "order-1",
        actor_id: ADMIN_ID,
        created_at: "2026-09-18T05:00:00.000Z",
        changes: [{ type: "item_discount_changed", item_key: "mango:large", before: 0, after: 25 }],
      },
    ], {
      selectedActorIds: [TEAM_MEMBER_ID],
      since: "2026-09-17T18:00:00.000Z",
      until: "2026-09-18T18:00:00.000Z",
    });

    expect(result.get(TEAM_MEMBER_ID)).toEqual({ count: 2, value: 550 });
  });

  it("does not credit replacement additions and removes a later full removal", () => {
    const result = calculateRetainedUpsells([
      {
        id: "upsell",
        order_id: "order-1",
        actor_id: TEAM_MEMBER_ID,
        created_at: "2026-09-18T03:00:00.000Z",
        changes: [{ type: "item_added", item_key: "mango:large", quantity_delta: 1, amount_delta: 300, addition_reason: "upsell" }],
      },
      {
        id: "removed",
        order_id: "order-1",
        actor_id: ADMIN_ID,
        created_at: "2026-09-18T04:00:00.000Z",
        changes: [{ type: "item_removed", item_key: "mango:large", quantity_delta: -1, amount_delta: -300 }],
      },
      {
        id: "replacement",
        order_id: "order-1",
        actor_id: ADMIN_ID,
        created_at: "2026-09-18T04:00:01.000Z",
        changes: [{ type: "item_added", item_key: "mango:small", quantity_delta: 1, amount_delta: 250, addition_reason: "replacement" }],
      },
    ], { selectedActorIds: [TEAM_MEMBER_ID] });

    expect(result.get(TEAM_MEMBER_ID)).toEqual({ count: 0, value: 0 });
  });

  it("reduces retained value when the order discount increases", () => {
    const result = calculateRetainedUpsells([
      {
        id: "upsell",
        order_id: "order-1",
        actor_id: TEAM_MEMBER_ID,
        created_at: "2026-09-18T03:00:00.000Z",
        changes: [{ type: "item_added", item_key: "mango:large", quantity_delta: 2, amount_delta: 600, addition_reason: "upsell" }],
      },
      {
        id: "discount",
        order_id: "order-1",
        actor_id: ADMIN_ID,
        created_at: "2026-09-18T04:00:00.000Z",
        changes: [{ type: "field_changed", field: "discount", before: 0, after: 100 }],
      },
    ], { selectedActorIds: [TEAM_MEMBER_ID] });

    expect(result.get(TEAM_MEMBER_ID)).toEqual({ count: 2, value: 500 });
  });

  it("allocates a shared item reduction proportionally across staff lots", () => {
    const result = calculateRetainedUpsells([
      { id: "a", order_id: "order-1", actor_id: TEAM_MEMBER_ID, created_at: "2026-09-18T01:00:00Z", changes: [{ type: "item_added", item_key: "mango:large", quantity_delta: 1, amount_delta: 300, addition_reason: "upsell" }] },
      { id: "b", order_id: "order-1", actor_id: ADMIN_ID, created_at: "2026-09-18T02:00:00Z", changes: [{ type: "item_quantity_increased", item_key: "mango:large", quantity_delta: 3, amount_delta: 900, addition_reason: "upsell" }] },
      { id: "c", order_id: "order-1", actor_id: ADMIN_ID, created_at: "2026-09-18T03:00:00Z", changes: [{ type: "item_quantity_decreased", item_key: "mango:large", quantity_delta: -2, amount_delta: -600 }] },
    ], { selectedActorIds: [TEAM_MEMBER_ID, ADMIN_ID] });

    expect(result.get(TEAM_MEMBER_ID)).toEqual({ count: 0.5, value: 150 });
    expect(result.get(ADMIN_ID)).toEqual({ count: 1.5, value: 450 });
  });

  it("ignores reductions after the selected reporting period", () => {
    const result = calculateRetainedUpsells([
      { id: "a", order_id: "order-1", actor_id: TEAM_MEMBER_ID, created_at: "2026-09-18T01:00:00Z", changes: [{ type: "item_added", item_key: "mango:large", quantity_delta: 2, amount_delta: 600, addition_reason: "upsell" }] },
      { id: "b", order_id: "order-1", actor_id: ADMIN_ID, created_at: "2026-09-19T01:00:00Z", changes: [{ type: "item_removed", item_key: "mango:large", quantity_delta: -2, amount_delta: -600 }] },
    ], { selectedActorIds: [TEAM_MEMBER_ID], until: "2026-09-18T18:00:00Z" });

    expect(result.get(TEAM_MEMBER_ID)).toEqual({ count: 2, value: 600 });
  });

  it("zeros retained upsell for terminal-loss orders", () => {
    const result = calculateRetainedUpsells([
      { id: "a", order_id: "order-1", actor_id: TEAM_MEMBER_ID, created_at: "2026-09-18T01:00:00Z", changes: [{ type: "item_added", item_key: "mango:large", quantity_delta: 2, amount_delta: 600, addition_reason: "upsell" }] },
    ], {
      selectedActorIds: [TEAM_MEMBER_ID],
      terminalLossOrderIds: new Set(["order-1"]),
    });

    expect(result.get(TEAM_MEMBER_ID)).toEqual({ count: 0, value: 0 });
  });

  it("restores retained upsell when a cancelled order is reopened before period end", () => {
    const result = calculateRetainedUpsells([
      { id: "a", order_id: "order-1", actor_id: TEAM_MEMBER_ID, event_type: "order.edited", created_at: "2026-09-18T01:00:00Z", changes: [{ type: "item_added", item_key: "mango:large", quantity_delta: 1, amount_delta: 300, addition_reason: "upsell" }] },
      { id: "b", order_id: "order-1", actor_id: ADMIN_ID, event_type: "order.cancelled", created_at: "2026-09-18T02:00:00Z", changes: [] },
      { id: "c", order_id: "order-1", actor_id: ADMIN_ID, event_type: "order.reopened", created_at: "2026-09-18T03:00:00Z", changes: [] },
    ], { selectedActorIds: [TEAM_MEMBER_ID] });

    expect(result.get(TEAM_MEMBER_ID)).toEqual({ count: 1, value: 300 });
  });

  it("derives terminal loss from detailed lifecycle events", () => {
    const result = calculateRetainedUpsells([
      { id: "a", order_id: "order-1", actor_id: TEAM_MEMBER_ID, event_type: "order.edited", created_at: "2026-09-18T01:00:00Z", changes: [{ type: "item_added", item_key: "mango:large", quantity_delta: 1, amount_delta: 300, addition_reason: "upsell" }] },
      { id: "b", order_id: "order-1", actor_id: ADMIN_ID, event_type: "order.cancelled", created_at: "2026-09-18T02:00:00Z", changes: [] },
    ], { selectedActorIds: [TEAM_MEMBER_ID] });

    expect(result.get(TEAM_MEMBER_ID)).toEqual({ count: 0, value: 0 });
  });

  it("keeps proportional allocation when a staff filter narrows output rows", () => {
    const result = calculateRetainedUpsells([
      { id: "a", order_id: "order-1", actor_id: TEAM_MEMBER_ID, created_at: "2026-09-18T01:00:00Z", changes: [{ type: "item_added", item_key: "mango:large", quantity_delta: 1, amount_delta: 300, addition_reason: "upsell" }] },
      { id: "b", order_id: "order-1", actor_id: ADMIN_ID, created_at: "2026-09-18T02:00:00Z", changes: [{ type: "item_quantity_increased", item_key: "mango:large", quantity_delta: 3, amount_delta: 900, addition_reason: "upsell" }] },
      { id: "c", order_id: "order-1", actor_id: ADMIN_ID, created_at: "2026-09-18T03:00:00Z", changes: [{ type: "item_quantity_decreased", item_key: "mango:large", quantity_delta: -2, amount_delta: -600 }] },
    ], { selectedActorIds: [TEAM_MEMBER_ID] });

    expect(result.get(TEAM_MEMBER_ID)).toEqual({ count: 0.5, value: 150 });
    expect(result.has(ADMIN_ID)).toBe(false);
  });
});

describe("toDhakaInterval", () => {
  it("uses the next Dhaka midnight as an exclusive upper bound", () => {
    expect(toDhakaInterval("2026-09-18", "2026-09-18")).toEqual({
      from: "2026-09-18",
      to: "2026-09-18",
      since: "2026-09-17T18:00:00.000Z",
      until: "2026-09-18T18:00:00.000Z",
    });
  });

  it("rejects a calendar date that JavaScript would otherwise normalize", () => {
    expect(() => toDhakaInterval("2026-02-30", "2026-03-01")).toThrow(
      "Invalid report date",
    );
  });
});

describe("resolveStaffReportRequest", () => {
  it("keeps a team member on their own report despite a forged staff filter", () => {
    const result = resolveStaffReportRequest({
      from: "2026-09-18",
      to: "2026-09-18",
      users: ADMIN_ID,
      role: "team_member",
      userId: TEAM_MEMBER_ID,
      staff: [
        { user_id: ADMIN_ID, display_name: "Admin" },
        { user_id: TEAM_MEMBER_ID, display_name: "Rafi" },
      ],
    });

    expect(result.selectedUserIds).toEqual([TEAM_MEMBER_ID]);
  });

  it("gives a team member the whole team, and their filter, on a team-wide report", () => {
    const staff = [
      { user_id: ADMIN_ID, display_name: "Admin" },
      { user_id: TEAM_MEMBER_ID, display_name: "Rafi" },
    ];
    const base = { from: "2026-09-18", to: "2026-09-18", role: "team_member", userId: TEAM_MEMBER_ID, staff, teamWide: true };

    expect(resolveStaffReportRequest(base).selectedUserIds).toEqual([ADMIN_ID, TEAM_MEMBER_ID]);
    expect(resolveStaffReportRequest({ ...base, users: ADMIN_ID }).selectedUserIds).toEqual([ADMIN_ID]);
  });

  it("selects every roster member for an unfiltered admin report", () => {
    const result = resolveStaffReportRequest({
      from: "2026-09-18",
      to: "2026-09-18",
      role: "admin",
      userId: ADMIN_ID,
      staff: [
        { user_id: ADMIN_ID, display_name: "Admin" },
        { user_id: TEAM_MEMBER_ID, display_name: "Rafi", deleted_at: "2026-09-01T00:00:00.000Z" },
      ],
    });

    expect(result.selectedUserIds).toEqual([ADMIN_ID, TEAM_MEMBER_ID]);
  });

  it("deduplicates an admin's valid staff filter before querying report rows", () => {
    const result = resolveStaffReportRequest({
      from: "2026-09-18",
      to: "2026-09-18",
      users: `${TEAM_MEMBER_ID},${TEAM_MEMBER_ID}`,
      role: "admin",
      userId: ADMIN_ID,
      staff: [
        { user_id: ADMIN_ID, display_name: "Admin" },
        { user_id: TEAM_MEMBER_ID, display_name: "Rafi" },
      ],
    });

    expect(result.selectedUserIds).toEqual([TEAM_MEMBER_ID]);
  });

  it("rejects an admin filter that names someone outside the workspace roster", () => {
    expect(() => resolveStaffReportRequest({
      from: "2026-09-18",
      to: "2026-09-18",
      users: "33333333-3333-3333-3333-333333333333",
      role: "admin",
      userId: ADMIN_ID,
      staff: [{ user_id: ADMIN_ID, display_name: "Admin" }],
    })).toThrow("Selected staff member is not in this workspace");
  });

  it("rejects a malformed admin staff filter instead of treating it as a user id", () => {
    expect(() => resolveStaffReportRequest({
      from: "2026-09-18",
      to: "2026-09-18",
      users: "not-a-uuid",
      role: "admin",
      userId: ADMIN_ID,
      staff: [{ user_id: ADMIN_ID, display_name: "Admin" }],
    })).toThrow("Invalid users filter");
  });

  it("marks invalid client filters as 400-level request errors", () => {
    let error: unknown;
    try {
      resolveStaffReportRequest({
        from: "2026-09-18",
        role: "admin",
        userId: ADMIN_ID,
        staff: [{ user_id: ADMIN_ID, display_name: "Admin" }],
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      message: "Provide both from and to dates",
      statusCode: 400,
    });
  });

  it("rejects a report range when only one date boundary is supplied", () => {
    expect(() => resolveStaffReportRequest({
      from: "2026-09-18",
      role: "admin",
      userId: ADMIN_ID,
      staff: [{ user_id: ADMIN_ID, display_name: "Admin" }],
    })).toThrow("Provide both from and to dates");
  });

  it("rejects a report range whose end date is before its start date", () => {
    expect(() => resolveStaffReportRequest({
      from: "2026-09-19",
      to: "2026-09-18",
      role: "admin",
      userId: ADMIN_ID,
      staff: [{ user_id: ADMIN_ID, display_name: "Admin" }],
    })).toThrow("Report start date must not be after the end date");
  });

  it("rejects an impossible calendar date before resolving the staff filter", () => {
    expect(() => resolveStaffReportRequest({
      from: "2026-13-01",
      to: "2026-09-18",
      role: "admin",
      userId: ADMIN_ID,
      staff: [{ user_id: ADMIN_ID, display_name: "Admin" }],
    })).toThrow("Invalid report date");
  });
});

describe("buildStaffReport", () => {
  it("uses the attribution timestamp that belongs to each metric", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [
        {
          id: "assigned-in-range",
          assigned_to: TEAM_MEMBER_ID,
          created_at: "2026-09-17T18:00:00.000Z",
        },
        {
          id: "confirmed-at-exclusive-end",
          confirmed_by: TEAM_MEMBER_ID,
          confirmed_at: "2026-09-18T18:00:00.000Z",
          price: 700,
        },
        {
          id: "cancelled-in-range",
          cancelled_by: TEAM_MEMBER_ID,
          cancelled_at: "2026-09-18T17:59:59.999Z",
          price: 400,
        },
      ],
      [],
      [],
      [],
      [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }],
      interval,
    );

    expect(report.rows[0].orders).toMatchObject({
      assigned_count: 1,
      confirmed_count: 0,
      cancelled_count: 1,
      cancelled_value: 400,
    });
  });

  it("credits a staff member's assigned telesales confirmation and its product detail", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [{
        id: "order-1",
        assigned_to: TEAM_MEMBER_ID,
        confirmed_by: TEAM_MEMBER_ID,
        confirmed_at: "2026-09-18T04:00:00.000Z",
        created_at: "2026-09-18T03:00:00.000Z",
        price: "1200",
        weight_kg: "2.5",
        source: "telesales",
        courier_status: "delivered",
      }],
      [],
      [{
        order_id: "order-1",
        product_id: "product-1",
        product_name: "Mango",
        quantity: 2,
      }],
      [{ id: "product-1", name: "Mango", weight_kg: "1" }],
      [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }],
      interval,
    );

    expect(report.rows[0].orders).toMatchObject({
      assigned_count: 1,
      confirmed_count: 1,
      confirmed_assigned_count: 1,
      confirmed_value: 1200,
      confirmed_kg: 2.5,
      confirmation_rate: 1,
      average_order_value: 1200,
      delivered_count: 1,
      delivered_value: 1200,
      delivered_rate: 1,
      telesales_confirmed_count: 1,
      telesales_confirmed_value: 1200,
      telesales_confirmed_kg: 2.5,
      products: [{ product_id: "product-1", product_name: "Mango", packs: 2, kg: 2 }],
    });
  });

  it("keeps confirmation rates within the selected assigned-work cohort", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [
        {
          id: "assigned-in-range",
          assigned_to: TEAM_MEMBER_ID,
          created_at: "2026-09-18T03:00:00.000Z",
          confirmed_by: TEAM_MEMBER_ID,
          confirmed_at: "2026-09-18T04:00:00.000Z",
        },
        {
          id: "assigned-before-range-1",
          assigned_to: TEAM_MEMBER_ID,
          created_at: "2026-09-17T03:00:00.000Z",
          confirmed_by: TEAM_MEMBER_ID,
          confirmed_at: "2026-09-18T05:00:00.000Z",
        },
        {
          id: "assigned-before-range-2",
          assigned_to: TEAM_MEMBER_ID,
          created_at: "2026-09-16T03:00:00.000Z",
          confirmed_by: TEAM_MEMBER_ID,
          confirmed_at: "2026-09-18T06:00:00.000Z",
        },
      ],
      [],
      [],
      [],
      [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }],
      interval,
    );

    expect(report.rows[0].orders).toMatchObject({
      assigned_count: 1,
      confirmed_count: 3,
      confirmed_assigned_count: 1,
      confirmation_rate: 1,
    });
  });

  it("preserves historical confirmation and cancellation work from status events", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [{
        id: "re-approved-order",
        assigned_to: TEAM_MEMBER_ID,
        created_at: "2026-09-18T03:00:00.000Z",
        confirmed_by: ADMIN_ID,
        confirmed_at: "2026-09-19T04:00:00.000Z",
        price: 900,
      }],
      [],
      [],
      [],
      [
        { user_id: TEAM_MEMBER_ID, display_name: "Rafi" },
        { user_id: ADMIN_ID, display_name: "Admin" },
      ],
      {
        ...interval,
        regularActivities: [
          {
            action: "confirmed",
            actor_id: TEAM_MEMBER_ID,
            occurred_at: "2026-09-18T04:00:00.000Z",
            order: {
              id: "re-approved-order",
              assigned_to: TEAM_MEMBER_ID,
              created_at: "2026-09-18T03:00:00.000Z",
              price: 900,
            },
          },
          {
            action: "cancelled",
            actor_id: ADMIN_ID,
            occurred_at: "2026-09-18T05:00:00.000Z",
            order: {
              id: "re-approved-order",
              assigned_to: TEAM_MEMBER_ID,
              created_at: "2026-09-18T03:00:00.000Z",
              price: 900,
            },
          },
        ],
      },
    );

    expect(report.rows.find((row) => row.user_id === TEAM_MEMBER_ID)?.orders).toMatchObject({
      confirmed_count: 1,
      confirmed_value: 900,
      confirmed_assigned_count: 1,
    });
    expect(report.rows.find((row) => row.user_id === ADMIN_ID)?.orders).toMatchObject({
      cancelled_count: 1,
      cancelled_value: 900,
      cancelled_assigned_count: 0,
    });
  });

  it("uses a verified product ID instead of a conflicting historic item name", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [{
        id: "id-precedence-order",
        confirmed_by: TEAM_MEMBER_ID,
        confirmed_at: "2026-09-18T04:00:00.000Z",
      }],
      [],
      [{
        order_id: "id-precedence-order",
        product_id: "green-mango",
        product_name: "Ripe Mango",
        quantity: 2,
      }],
      [
        { id: "green-mango", name: "Green Mango", weight_kg: 1.25 },
        { id: "ripe-mango", name: "Ripe Mango", weight_kg: 0.25 },
      ],
      [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }],
      interval,
    );

    expect(report.rows[0].orders.products).toEqual([
      { product_id: "green-mango", product_name: "Green Mango", packs: 2, kg: 2.5, ...NO_OUTCOMES },
    ]);
  });

  it("keeps a regular confirmation rate unavailable for an unassigned confirmation", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [{
        id: "unassigned-confirmation",
        confirmed_by: TEAM_MEMBER_ID,
        confirmed_at: "2026-09-18T04:00:00.000Z",
        price: 800,
        courier_status: "delivered",
      }],
      [],
      [],
      [],
      [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }],
      interval,
    );

    expect(report.rows[0].orders).toMatchObject({
      assigned_count: 0,
      confirmed_count: 1,
      confirmation_rate: null,
      delivered_rate: 1,
    });
  });

  it("credits a later human cancellation separately from the original confirmation", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [{
        id: "confirmed-then-cancelled",
        assigned_to: TEAM_MEMBER_ID,
        confirmed_by: TEAM_MEMBER_ID,
        confirmed_at: "2026-09-18T04:00:00.000Z",
        created_at: "2026-09-18T03:00:00.000Z",
        cancelled_by: ADMIN_ID,
        cancelled_at: "2026-09-18T05:00:00.000Z",
        price: 900,
      }],
      [],
      [],
      [],
      [
        { user_id: TEAM_MEMBER_ID, display_name: "Rafi" },
        { user_id: ADMIN_ID, display_name: "Admin" },
      ],
      interval,
    );
    const rafi = report.rows.find((row) => row.user_id === TEAM_MEMBER_ID)?.orders;
    const admin = report.rows.find((row) => row.user_id === ADMIN_ID)?.orders;

    expect(rafi).toMatchObject({
      assigned_count: 1,
      confirmed_count: 1,
      confirmed_assigned_count: 1,
      cancelled_count: 0,
    });
    expect(admin).toMatchObject({
      assigned_count: 0,
      confirmed_count: 0,
      cancelled_count: 1,
      cancelled_assigned_count: 0,
      cancelled_value: 900,
    });
  });

  it("credits a courier return without turning courier cancellation into a staff cancellation", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [
        {
          id: "returned-order",
          confirmed_by: TEAM_MEMBER_ID,
          confirmed_at: "2026-09-18T04:00:00.000Z",
          price: 700,
          courier_status: "Return To Hub",
        },
        {
          id: "courier-cancelled-order",
          confirmed_by: TEAM_MEMBER_ID,
          confirmed_at: "2026-09-18T05:00:00.000Z",
          price: 300,
          courier_status: "cancelled",
        },
      ],
      [],
      [],
      [],
      [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }],
      interval,
    );

    expect(report.rows[0].orders).toMatchObject({
      cancelled_count: 0,
      returned_count: 1,
      returned_value: 700,
      delivered_count: 0,
    });
  });

  it("counts only a human cancellation against the staff member who cancelled an assigned order", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [{
        id: "human-cancelled-order",
        assigned_to: TEAM_MEMBER_ID,
        created_at: "2026-09-18T03:00:00.000Z",
        cancelled_by: TEAM_MEMBER_ID,
        cancelled_at: "2026-09-18T04:00:00.000Z",
        price: 500,
        courier_status: "cancelled",
      }],
      [],
      [],
      [],
      [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }],
      interval,
    );

    expect(report.rows[0].orders).toMatchObject({
      assigned_count: 1,
      cancelled_count: 1,
      cancelled_assigned_count: 1,
      cancelled_value: 500,
      cancellation_rate: 1,
      returned_count: 0,
    });
  });

  it("credits human social confirmation work without inventing an assignment rate", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [],
      [{
        id: "inbox-order-1",
        confirmed_by: TEAM_MEMBER_ID,
        confirmed_at: "2026-09-18T04:00:00.000Z",
        total_price: "1380",
        weight_kg: "1.5",
        courier_status: "partial-delivered",
        items: [{ product_id: "product-1", product: "Mango", quantity: 3 }],
      }],
      [],
      [{ id: "product-1", name: "Mango", weight_kg: "0.5" }],
      [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }],
      interval,
    );

    expect(report.rows[0].social_inbox_orders).toMatchObject({
      assigned_count: 0,
      confirmation_rate: null,
      cancelled_count: 0,
      cancellation_rate: null,
      confirmed_count: 1,
      confirmed_value: 1380,
      confirmed_kg: 1.5,
      average_order_value: 1380,
      delivered_count: 1,
      delivered_value: 1380,
      delivered_rate: 1,
      products: [{ product_id: "product-1", product_name: "Mango", packs: 3, kg: 1.5 }],
    });
  });

  it("credits a human social cancellation while keeping social assignment rates unavailable", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [],
      [{
        id: "inbox-order-2",
        cancelled_by: TEAM_MEMBER_ID,
        cancelled_at: "2026-09-18T04:00:00.000Z",
        total_price: 450,
      }],
      [],
      [],
      [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }],
      interval,
    );

    expect(report.rows[0].social_inbox_orders).toMatchObject({
      cancelled_count: 1,
      cancelled_assigned_count: 0,
      cancelled_value: 450,
      cancellation_rate: null,
    });
  });

  it("flags a null-weight catalog product resolved from a historic social item name", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [],
      [{
        id: "historic-inbox-order",
        confirmed_by: TEAM_MEMBER_ID,
        confirmed_at: "2026-09-18T04:00:00.000Z",
        total_price: 600,
        items: [{ product: "  Mango  ", quantity: 2 }],
      }],
      [],
      [{ id: "product-mango", name: "Mango", weight_kg: null }],
      [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }],
      interval,
    );

    expect(report.rows[0].social_inbox_orders.products).toEqual([
      { product_id: "product-mango", product_name: "Mango", packs: 2, kg: 0, ...NO_OUTCOMES },
    ]);
    expect(report.missing_weight_products).toEqual([
      { id: "product-mango", name: "Mango" },
    ]);
  });

  it("does not attach a historic item to an arbitrary catalog product when exact names are duplicated", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [],
      [{
        id: "ambiguous-inbox-order",
        confirmed_by: TEAM_MEMBER_ID,
        confirmed_at: "2026-09-18T04:00:00.000Z",
        total_price: 600,
        items: [{ product: "Mango", quantity: 1 }],
      }],
      [],
      [
        { id: "product-mango-a", name: "Mango", weight_kg: 1 },
        { id: "product-mango-b", name: "Mango", weight_kg: null },
      ],
      [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }],
      interval,
    );

    expect(report.rows[0].social_inbox_orders.products).toEqual([
      { product_id: null, product_name: "Mango", packs: 1, kg: 0, ...NO_OUTCOMES },
    ]);
    expect(report.missing_weight_products).toEqual([]);
  });

  it("sorts social product detail by packs before product name", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [],
      [{
        id: "social-products",
        confirmed_by: TEAM_MEMBER_ID,
        confirmed_at: "2026-09-18T04:00:00.000Z",
        items: [
          { product_id: "product-b", product: "Beta", quantity: 1 },
          { product_id: "product-a", product: "Alpha", quantity: 2 },
        ],
      }],
      [],
      [
        { id: "product-a", name: "Alpha", weight_kg: 1 },
        { id: "product-b", name: "Beta", weight_kg: 1 },
      ],
      [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }],
      interval,
    );

    expect(report.rows[0].social_inbox_orders.products.map((product) => product.product_name)).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  it("ignores non-positive and malformed product quantities", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [],
      [{
        id: "invalid-social-items",
        confirmed_by: TEAM_MEMBER_ID,
        confirmed_at: "2026-09-18T04:00:00.000Z",
        items: [
          { product_id: "product-1", product: "Mango", quantity: 2 },
          { product_id: "product-1", product: "Mango", quantity: -1 },
          { product_id: "product-1", product: "Mango", quantity: "not-a-number" },
          { product_id: "product-2", product: "Lychee", quantity: 0 },
        ],
      }],
      [],
      [
        { id: "product-1", name: "Mango", weight_kg: 0.5 },
        { id: "product-2", name: "Lychee", weight_kg: null },
      ],
      [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }],
      interval,
    );

    expect(report.rows[0].social_inbox_orders.products).toEqual([
      { product_id: "product-1", product_name: "Mango", packs: 2, kg: 1, ...NO_OUTCOMES },
    ]);
    expect(report.missing_weight_products).toEqual([]);
  });

  it("ignores a malformed historic social items value without failing the report", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [],
      [{
        id: "malformed-social-items",
        confirmed_by: TEAM_MEMBER_ID,
        confirmed_at: "2026-09-18T04:00:00.000Z",
        total_price: 600,
        items: { product: "Mango", quantity: 1 },
      }],
      [],
      [{ id: "product-1", name: "Mango", weight_kg: 0.5 }],
      [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }],
      interval,
    );

    expect(report.rows[0].social_inbox_orders).toMatchObject({
      confirmed_count: 1,
      products: [],
    });
  });

  it("defaults abandoned checkout metrics to zero when there is no activity", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [], [], [], [],
      [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }],
      interval,
    );

    expect(report.rows[0].abandoned_checkouts).toEqual({
      contacted_count: 0,
      dismissed_count: 0,
      reopened_count: 0,
      converted_count: 0,
      converted_value: 0,
    });
  });

  it("credits contacted, dismissed, reopened, and converted abandoned-cart actions to the acting staff member", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [], [], [], [],
      [
        { user_id: TEAM_MEMBER_ID, display_name: "Rafi" },
        { user_id: ADMIN_ID, display_name: "Admin" },
      ],
      {
        ...interval,
        abandonedActivities: [
          { actor_id: TEAM_MEMBER_ID, occurred_at: "2026-09-18T04:00:00.000Z", action: "contacted" },
          { actor_id: TEAM_MEMBER_ID, occurred_at: "2026-09-18T05:00:00.000Z", action: "dismissed" },
          { actor_id: TEAM_MEMBER_ID, occurred_at: "2026-09-18T06:00:00.000Z", action: "reopened" },
          { actor_id: TEAM_MEMBER_ID, occurred_at: "2026-09-18T07:00:00.000Z", action: "converted", value: 850 },
          { actor_id: ADMIN_ID, occurred_at: "2026-09-18T07:30:00.000Z", action: "converted", value: 300 },
          // Outside the selected date range — must not be counted.
          { actor_id: TEAM_MEMBER_ID, occurred_at: "2026-09-17T04:00:00.000Z", action: "contacted" },
        ],
      },
    );

    const rafi = report.rows.find((row) => row.user_id === TEAM_MEMBER_ID)?.abandoned_checkouts;
    const admin = report.rows.find((row) => row.user_id === ADMIN_ID)?.abandoned_checkouts;

    expect(rafi).toEqual({
      contacted_count: 1,
      dismissed_count: 1,
      reopened_count: 1,
      converted_count: 1,
      converted_value: 850,
    });
    expect(admin).toMatchObject({
      converted_count: 1,
      converted_value: 300,
    });
  });

  it("includes retained net upsell attribution in regular-order staff metrics", () => {
    const report = buildStaffReport(
      [], [], [], [],
      [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }],
      {
        ...toDhakaInterval("2026-09-18", "2026-09-18"),
        upsellActivities: [{
          id: "upsell",
          order_id: "order-1",
          actor_id: TEAM_MEMBER_ID,
          created_at: "2026-09-18T03:00:00.000Z",
          changes: [{ type: "item_added", item_key: "mango:large", quantity_delta: 2, amount_delta: 600, addition_reason: "upsell" }],
        }],
      },
    );

    expect(report.rows[0].orders).toMatchObject({
      retained_upsell_count: 2,
      retained_upsell_value: 600,
    });
  });
});

describe("classifyCourierOutcome", () => {
  it.each([
    [{ courier_status: " Delivered " }, "delivered"],
    [{ courier_status: "partial-delivered" }, "delivered"],
    [{ courier_status: "RETURN TO HUB" }, "returned"],
    [{ return_status: "completed" }, "returned"],
    [{ courier_status: "cancelled" }, null],
    [{ courier_status: "rejected" }, null],
    [{ courier_status: "cancelled", return_status: "completed" }, null],
    [{ return_status: "processing" }, null],
  ])("classifies %o as %s", (order, expected) => {
    expect(classifyCourierOutcome(order)).toBe(expected);
  });
});

describe("buildStaffReport assigned outcomes and series", () => {
  const staff = [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }];
  // The route passes resolveStaffReportRequest's output, which carries `range`;
  // toDhakaInterval alone does not, so mirror the route's shape here.
  const withRange = (interval: ReturnType<typeof toDhakaInterval>) => ({
    ...interval,
    range: { from: interval.from, to: interval.to },
  });

  it("counts delivered and returned outcomes among the member's own assigned confirmations", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [
        { id: "a1", assigned_to: TEAM_MEMBER_ID, created_at: "2026-09-18T01:00:00.000Z", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-18T02:00:00.000Z", price: 1000, courier_status: "delivered" },
        { id: "a2", assigned_to: TEAM_MEMBER_ID, created_at: "2026-09-18T01:00:00.000Z", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-18T03:00:00.000Z", price: 500, courier_status: "returned" },
        { id: "a3", assigned_to: TEAM_MEMBER_ID, created_at: "2026-09-18T01:00:00.000Z", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-18T04:00:00.000Z", price: 700, courier_status: "in_review" },
        { id: "other", assigned_to: ADMIN_ID, created_at: "2026-09-18T01:00:00.000Z", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-18T05:00:00.000Z", price: 900, courier_status: "delivered" },
      ],
      [], [], [], staff, interval,
    );

    expect(report.rows[0].orders).toMatchObject({
      assigned_count: 3,
      confirmed_count: 4,
      confirmed_assigned_count: 3,
      delivered_count: 2,
      confirmed_assigned_delivered_count: 1,
      confirmed_assigned_returned_count: 1,
    });
  });

  it("counts an assigned order confirmed then cancelled by the same member as an overlap", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [{
        id: "flip",
        assigned_to: TEAM_MEMBER_ID,
        created_at: "2026-09-18T01:00:00.000Z",
        confirmed_by: TEAM_MEMBER_ID,
        confirmed_at: "2026-09-18T02:00:00.000Z",
        cancelled_by: TEAM_MEMBER_ID,
        cancelled_at: "2026-09-18T03:00:00.000Z",
        price: 800,
      }],
      [], [], [], staff, interval,
    );

    expect(report.rows[0].orders).toMatchObject({
      confirmed_assigned_count: 1,
      cancelled_assigned_count: 1,
      confirmed_assigned_cancelled_count: 1,
    });
  });

  it("buckets team confirmations by Dhaka hour for a single-day range", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [
        { id: "c1", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-18T03:10:00.000Z", price: 1000 }, // 09:10 Dhaka
        { id: "c2", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-18T03:50:00.000Z", price: 500 },  // 09:50 Dhaka
        { id: "c3", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-18T15:00:00.000Z", price: 700 },  // 21:00 Dhaka
      ],
      [], [], [], staff, withRange(interval),
    );

    expect(report.series.granularity).toBe("hour");
    expect(report.series.buckets).toHaveLength(24);
    expect(report.series.buckets[9]).toMatchObject({ key: "2026-09-18-9", label: "9a", confirmed_count: 2, confirmed_value: 1500 });
    expect(report.series.buckets[21]).toMatchObject({ label: "9p", confirmed_count: 1, confirmed_value: 700 });
    expect(report.series.buckets[0]).toMatchObject({ label: "12a", confirmed_count: 0 });
  });

  it("buckets handled outcomes and extra revenue by Dhaka hour", () => {
    const interval = toDhakaInterval("2026-09-18", "2026-09-18");
    const report = buildStaffReport(
      [
        // 09:xx Dhaka: one telesales confirm (delivered), one plain confirm, one cancel.
        { id: "t1", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-18T03:10:00.000Z", price: 1000, source: "telesales", courier_status: "delivered" },
        { id: "c2", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-18T03:20:00.000Z", price: 500 },
        { id: "x3", cancelled_by: TEAM_MEMBER_ID, cancelled_at: "2026-09-18T03:30:00.000Z", price: 400 },
      ],
      [], [], [], staff,
      {
        ...withRange(interval),
        abandonedActivities: [
          { actor_id: TEAM_MEMBER_ID, action: "converted", value: 300, occurred_at: "2026-09-18T15:00:00.000Z" }, // 21:00 Dhaka
        ],
        upsellActivities: [{
          id: "u1",
          order_id: "c2",
          actor_id: TEAM_MEMBER_ID,
          created_at: "2026-09-18T15:30:00.000Z", // 21:30 Dhaka
          changes: [{ item_key: "i1", addition_reason: "upsell", quantity_delta: 1, amount_delta: 200 }],
        }],
      },
    );

    expect(report.series.buckets[9]).toMatchObject({
      confirmed_count: 2,
      confirmed_value: 1500,
      handled_count: 3,
      handled_confirmed_count: 2,
      handled_delivered_count: 1,
      extra_value: 1000,
    });
    expect(report.series.buckets[21]).toMatchObject({ confirmed_count: 0, handled_count: 0, extra_value: 500 });
    expect(report.series.buckets[0]).toMatchObject({ handled_count: 0, handled_confirmed_count: 0, handled_delivered_count: 0, extra_value: 0 });
  });

  it("fills every day of a bounded multi-day range", () => {
    const interval = toDhakaInterval("2026-09-17", "2026-09-19");
    const report = buildStaffReport(
      [{ id: "c1", confirmed_by: TEAM_MEMBER_ID, confirmed_at: "2026-09-19T03:00:00.000Z", price: 800 }],
      [], [], [], staff, withRange(interval),
    );

    expect(report.series.granularity).toBe("day");
    expect(report.series.buckets.map((bucket) => [bucket.key, bucket.confirmed_count, bucket.confirmed_value])).toEqual([
      ["2026-09-17", 0, 0],
      ["2026-09-18", 0, 0],
      ["2026-09-19", 1, 800],
    ]);
    expect(report.series.buckets[0].label).toBe("Sep 17");
  });

  it("keeps the 30 most recent active days for All time", () => {
    const orders = Array.from({ length: 32 }, (_, index) => ({
      id: `c${index}`,
      confirmed_by: TEAM_MEMBER_ID,
      confirmed_at: new Date(Date.UTC(2026, 7, 1 + index, 3)).toISOString(),
      price: 100,
    }));
    const report = buildStaffReport(orders, [], [], [], staff, { since: null, until: null, range: { from: null, to: null } });

    expect(report.series.granularity).toBe("day");
    expect(report.series.buckets).toHaveLength(30);
    expect(report.series.buckets[0].key).toBe("2026-08-03");
    expect(report.series.buckets[29].key).toBe("2026-09-01");
  });
});

describe("buildStaffReport handled orders and product outcomes", () => {
  const staff = [{ user_id: TEAM_MEMBER_ID, display_name: "Rafi" }];
  const interval = toDhakaInterval("2026-09-18", "2026-09-18");
  const confirmedAt = "2026-09-18T02:00:00.000Z";
  const cancelledAt = "2026-09-18T03:00:00.000Z";
  const handledOrders = [
    { id: "A", confirmed_by: TEAM_MEMBER_ID, confirmed_at: confirmedAt, price: 1000, weight_kg: 2, courier_status: "delivered" },
    { id: "B", confirmed_by: TEAM_MEMBER_ID, confirmed_at: confirmedAt, cancelled_by: TEAM_MEMBER_ID, cancelled_at: cancelledAt, price: 500 },
    { id: "C", cancelled_by: TEAM_MEMBER_ID, cancelled_at: cancelledAt, price: 300, weight_kg: 1.5 },
  ];
  const catalog = [
    { id: "p-mango", name: "Mango", weight_kg: 1 },
    { id: "p-honey", name: "Honey", weight_kg: 0.5 },
  ];

  it("counts every order a member confirmed or cancelled once, classified by the member's last action", () => {
    const report = buildStaffReport(handledOrders, [], [], [], staff, interval);

    expect(report.rows[0].orders).toMatchObject({
      handled_count: 3,
      handled_confirmed_count: 1,
      handled_confirmed_value: 1000,
      handled_confirmed_kg: 2,
      handled_cancelled_count: 2,
      handled_cancelled_value: 800,
      handled_delivered_count: 1,
      handled_delivered_value: 1000,
      handled_returned_count: 0,
      handled_returned_value: 0,
      // Activity counters stay as they were for compatibility.
      confirmed_count: 2,
      cancelled_count: 2,
    });
    expect(report.rows[0].orders).not.toHaveProperty("confirmed_then_cancelled_count");
  });

  it("counts each order once when a member re-confirms or cancels it again", () => {
    const orderB = { id: "B", price: 500, weight_kg: 2, courier_status: "delivered" };
    const orderD = { id: "D", price: 300, weight_kg: 1 };
    const at = (hour: number) => `2026-09-18T0${hour}:00:00.000Z`;
    const report = buildStaffReport(
      [],
      [],
      [
        { order_id: "B", product_id: "p-mango", product_name: "Mango", quantity: 2 },
        { order_id: "D", product_id: "p-honey", product_name: "Honey", quantity: 1 },
      ],
      catalog,
      staff,
      {
        ...interval,
        regularActivities: [
          { action: "confirmed", actor_id: TEAM_MEMBER_ID, occurred_at: at(1), order_id: "B", order: orderB },
          { action: "cancelled", actor_id: TEAM_MEMBER_ID, occurred_at: at(2), order_id: "B", order: orderB },
          { action: "confirmed", actor_id: TEAM_MEMBER_ID, occurred_at: at(3), order_id: "B", order: orderB },
          { action: "cancelled", actor_id: TEAM_MEMBER_ID, occurred_at: at(1), order_id: "D", order: orderD },
          { action: "cancelled", actor_id: TEAM_MEMBER_ID, occurred_at: at(4), order_id: "D", order: orderD },
        ],
      },
    );

    expect(report.rows[0].orders).toMatchObject({
      handled_count: 2,
      handled_confirmed_count: 1,
      handled_confirmed_value: 500,
      handled_cancelled_count: 1,
      handled_cancelled_value: 300,
      handled_delivered_count: 1,
      handled_delivered_value: 500,
      confirmed_count: 1,
      confirmed_value: 500,
      cancelled_count: 3,
    });
    expect(report.rows[0].orders.products).toEqual([
      {
        product_id: "p-mango", product_name: "Mango", packs: 2, kg: 2,
        delivered_packs: 2, delivered_kg: 2, returned_packs: 0, returned_kg: 0, cancelled_packs: 0, cancelled_kg: 0,
      },
      {
        product_id: "p-honey", product_name: "Honey", packs: 0, kg: 0,
        delivered_packs: 0, delivered_kg: 0, returned_packs: 0, returned_kg: 0, cancelled_packs: 1, cancelled_kg: 0.5,
      },
    ]);
  });

  it("credits an order re-approved by another member once, to its latest approval", () => {
    const order = { id: "R", price: 400, weight_kg: 1, source: "telesales", courier_status: "delivered" };
    const report = buildStaffReport([], [], [], [], [...staff, { user_id: ADMIN_ID, display_name: "Nadia" }], {
      ...interval,
      regularActivities: [
        { action: "confirmed", actor_id: TEAM_MEMBER_ID, occurred_at: "2026-09-18T01:00:00.000Z", order_id: "R", order },
        { action: "confirmed", actor_id: ADMIN_ID, occurred_at: "2026-09-18T02:00:00.000Z", order_id: "R", order },
      ],
    });
    const byId = new Map(report.rows.map((row) => [row.user_id, row.orders]));

    expect(byId.get(TEAM_MEMBER_ID)).toMatchObject({ confirmed_count: 0, confirmed_value: 0, telesales_confirmed_value: 0, delivered_count: 0, handled_confirmed_count: 1 });
    expect(byId.get(ADMIN_ID)).toMatchObject({ confirmed_count: 1, confirmed_value: 400, telesales_confirmed_value: 400, delivered_count: 1, handled_confirmed_count: 1 });
    expect(report.series.buckets.reduce((sum, bucket) => sum + bucket.confirmed_value, 0)).toBe(400);
  });

  it("classifies an order as cancelled when the member's confirm and cancel share a timestamp", () => {
    const report = buildStaffReport(
      [{ id: "T", confirmed_by: TEAM_MEMBER_ID, confirmed_at: confirmedAt, cancelled_by: TEAM_MEMBER_ID, cancelled_at: confirmedAt, price: 400 }],
      [], [], [], staff, interval,
    );

    expect(report.rows[0].orders).toMatchObject({ handled_count: 1, handled_cancelled_count: 1, handled_confirmed_count: 0 });
  });

  it("counts activities with an unknown order id once each and never merges them", () => {
    const report = buildStaffReport([], [], [], [], staff, {
      ...interval,
      regularActivities: [
        { action: "confirmed", actor_id: TEAM_MEMBER_ID, occurred_at: confirmedAt, order: {} },
        { action: "cancelled", actor_id: TEAM_MEMBER_ID, occurred_at: cancelledAt, order: {} },
      ],
    });

    expect(report.rows[0].orders).toMatchObject({ handled_count: 2, handled_confirmed_count: 1, handled_cancelled_count: 1 });
  });

  it("splits each product into confirmed, delivered, returned and cancelled packs and kg", () => {
    const report = buildStaffReport(
      handledOrders,
      [],
      [
        { order_id: "A", product_id: "p-mango", product_name: "Mango", quantity: 2 },
        { order_id: "C", product_id: "p-mango", product_name: "Mango", quantity: 1 },
        { order_id: "C", product_id: "p-honey", product_name: "Honey", quantity: 1 },
      ],
      catalog,
      staff,
      interval,
    );

    expect(report.rows[0].orders.products).toEqual([
      {
        product_id: "p-mango", product_name: "Mango", packs: 2, kg: 2,
        delivered_packs: 2, delivered_kg: 2, returned_packs: 0, returned_kg: 0, cancelled_packs: 1, cancelled_kg: 1,
      },
      {
        product_id: "p-honey", product_name: "Honey", packs: 0, kg: 0,
        delivered_packs: 0, delivered_kg: 0, returned_packs: 0, returned_kg: 0, cancelled_packs: 1, cancelled_kg: 0.5,
      },
    ]);
  });

  it("puts a returned confirmation's items in the returned columns", () => {
    const report = buildStaffReport(
      [{ id: "R", confirmed_by: TEAM_MEMBER_ID, confirmed_at: confirmedAt, price: 700, courier_status: "returned" }],
      [],
      [{ order_id: "R", product_id: "p-honey", product_name: "Honey", quantity: 2 }],
      catalog,
      staff,
      interval,
    );

    expect(report.rows[0].orders.products).toEqual([{
      product_id: "p-honey", product_name: "Honey", packs: 2, kg: 1,
      delivered_packs: 0, delivered_kg: 0, returned_packs: 2, returned_kg: 1, cancelled_packs: 0, cancelled_kg: 0,
    }]);
  });
});
