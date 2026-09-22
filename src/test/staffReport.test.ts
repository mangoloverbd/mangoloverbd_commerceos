import { describe, expect, it } from "vitest";
import {
  buildStaffReport,
  classifyCourierOutcome,
  resolveStaffReportRequest,
  toDhakaInterval,
} from "../../server/reports.js";

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const TEAM_MEMBER_ID = "22222222-2222-2222-2222-222222222222";

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
      { product_id: "green-mango", product_name: "Green Mango", packs: 2, kg: 2.5 },
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
      { product_id: "product-mango", product_name: "Mango", packs: 2, kg: 0 },
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
      { product_id: null, product_name: "Mango", packs: 1, kg: 0 },
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
      { product_id: "product-1", product_name: "Mango", packs: 2, kg: 1 },
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
