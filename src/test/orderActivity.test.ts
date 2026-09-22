import { describe, expect, it } from "vitest";
import {
  buildDetailedActivityEvent,
  buildOrderChanges,
  groupActivityEvents,
  meaningfulViewBucket,
  validateCancellationReason,
} from "../../server/orderActivity.js";

describe("detailed order activity", () => {
  it("requires a supported cancellation reason and a note for Other", () => {
    expect(validateCancellationReason({ code: "customer_changed_mind", note: "  Bought elsewhere  " }))
      .toEqual({ code: "customer_changed_mind", note: "Bought elsewhere" });
    expect(() => validateCancellationReason({ code: "", note: "" })).toThrow("Cancellation reason is required");
    expect(() => validateCancellationReason({ code: "other", note: "  " })).toThrow("Cancellation note is required");
    expect(() => validateCancellationReason({ code: "invented", note: "x" })).toThrow("Invalid cancellation reason");
  });

  it("uses stable thirty-minute UTC buckets for meaningful views", () => {
    expect(meaningfulViewBucket("2026-09-22T10:01:00.000Z")).toBe("2026-09-22T10:00:00.000Z");
    expect(meaningfulViewBucket("2026-09-22T10:29:59.999Z")).toBe("2026-09-22T10:00:00.000Z");
    expect(meaningfulViewBucket("2026-09-22T10:30:00.000Z")).toBe("2026-09-22T10:30:00.000Z");
  });

  it("builds exact field and item changes and requires a reason for additions", () => {
    const input = {
      beforeOrder: { phone: "01700000000", delivery_rate: 80, price: 1000 },
      afterOrder: { phone: "01800000000", delivery_rate: 0, price: 1450 },
      beforeItems: [{ product_id: "p1", variant_id: null, product_name: "Mango", quantity: 1, unit_price: 1000, unit_discount: 0 }],
      afterItems: [
        { product_id: "p1", variant_id: null, product_name: "Mango", quantity: 1, unit_price: 1000, unit_discount: 0 },
        { product_id: "p2", variant_id: "v2", product_name: "Honey", variant_name: "500g", quantity: 1, unit_price: 450, unit_discount: 0 },
      ],
      additionReasons: { "p2:v2": "upsell" },
    };

    expect(buildOrderChanges(input)).toEqual([
      { type: "field_changed", field: "phone", label: "Phone", before: "01700000000", after: "01800000000" },
      { type: "field_changed", field: "delivery_rate", label: "Delivery fee", before: 80, after: 0 },
      { type: "field_changed", field: "price", label: "Order total", before: 1000, after: 1450 },
      {
        type: "item_added",
        item_key: "p2:v2",
        label: "Honey · 500g",
        before: 0,
        after: 1,
        quantity_delta: 1,
        amount_delta: 450,
        addition_reason: "upsell",
      },
    ]);

    expect(() => buildOrderChanges({ ...input, additionReasons: {} })).toThrow("Choose why Honey was added");
  });

  it("requires a reason when an existing item quantity increases", () => {
    expect(() => buildOrderChanges({
      beforeOrder: {},
      afterOrder: {},
      beforeItems: [{ product_id: "p1", variant_id: null, product_name: "Mango", quantity: 1, unit_price: 500, unit_discount: 0 }],
      afterItems: [{ product_id: "p1", variant_id: null, product_name: "Mango", quantity: 2, unit_price: 500, unit_discount: 0 }],
      additionReasons: {},
    })).toThrow("Choose why Mango was added");
  });

  it("constructs only allowlisted, workspace-scoped event rows", () => {
    expect(buildDetailedActivityEvent({
      orgId: "org-1",
      orderId: "order-1",
      orderTable: "orders",
      eventType: "order.edited",
      category: "edit",
      actorId: "user-1",
      actorKind: "user",
      groupId: "8e7cac10-52b7-45fc-94bf-890c82dce305",
      sourceSurface: "pending_queue",
      summary: "Edited order",
      changes: [{ type: "field_changed", field: "phone", before: "1", after: "2" }],
      metadata: { ignored_secret: "not accepted" },
    })).toEqual({
      org_id: "org-1",
      order_id: "order-1",
      order_table: "orders",
      event_type: "order.edited",
      category: "edit",
      actor_id: "user-1",
      actor_kind: "user",
      group_id: "8e7cac10-52b7-45fc-94bf-890c82dce305",
      source_surface: "pending_queue",
      summary: "Edited order",
      reason_code: null,
      reason_note: null,
      changes: [{ type: "field_changed", field: "phone", before: "1", after: "2" }],
      metadata: {},
    });
  });

  it("groups rows from one save while preserving all changes", () => {
    const grouped = groupActivityEvents([
      { id: "a", group_id: "g1", created_at: "2026-09-22T10:00:02Z", event_type: "order.edited", category: "edit", actor_id: "u1", summary: "Edited customer", changes: [{ field: "phone" }] },
      { id: "b", group_id: "g1", created_at: "2026-09-22T10:00:01Z", event_type: "order.edited", category: "edit", actor_id: "u1", summary: "Edited cart", changes: [{ type: "item_added" }] },
      { id: "c", group_id: null, created_at: "2026-09-22T09:00:00Z", event_type: "order.viewed", category: "view", actor_id: "u2", summary: "Viewed order", changes: [] },
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({ id: "g1", group_id: "g1", summary: "Edited order", change_count: 2 });
    expect(grouped[0].changes).toEqual([{ field: "phone" }, { type: "item_added" }]);
    expect(grouped[1]).toMatchObject({ id: "c", event_type: "order.viewed", change_count: 0 });
  });
});
