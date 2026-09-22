import { describe, expect, it } from "vitest";
import {
  ACTIVITY_ORDER_TABLES,
  activityFetchLimit,
  buildActivityLogEntry,
  buildOrderLookup,
  classifyActivityEvent,
  mergeActivityStreams,
  orderReferenceKey,
  resolveActivityActionFilter,
  resolveActivityPage,
  resolveActivityTableFilter,
} from "../../server/activityLog.js";

describe("mergeActivityStreams", () => {
  it("suppresses only the exact linked legacy status event", () => {
    const detailed = [{
      id: "detailed-1",
      order_id: "order-1",
      order_table: "orders",
      actor_id: "actor-1",
      event_type: "order.status_changed",
      created_at: "2026-09-22T10:00:00.500Z",
      metadata: { legacy_status_event_id: "legacy-1" },
    }];
    const legacy = [
      { id: "legacy-1", order_id: "order-1", order_table: "orders", actor_id: "actor-1", from_status: "pending", to_status: "approved", created_at: "2026-09-22T10:00:00.000Z" },
      { id: "legacy-2", order_id: "order-1", order_table: "orders", actor_id: "actor-1", from_status: "approved", to_status: "print", created_at: "2026-09-22T10:00:01.000Z" },
    ];

    expect(mergeActivityStreams(detailed, legacy).map((event) => event.id)).toEqual([
      "legacy-2",
      "detailed-1",
    ]);
  });

  it("uses time reconciliation only for unlinked compatibility rows", () => {
    const detailed = [{ id: "detailed-1", order_id: "order-1", order_table: "orders", actor_id: "actor-1", event_type: "order.cancelled", created_at: "2026-09-22T10:00:00.500Z", metadata: {} }];
    const legacy = [{ id: "legacy-1", order_id: "order-1", order_table: "orders", actor_id: "actor-1", from_status: "approved", to_status: "cancelled", created_at: "2026-09-22T10:00:00.000Z" }];

    expect(mergeActivityStreams(detailed, legacy).map((event) => event.id)).toEqual(["detailed-1"]);
  });
});

describe("classifyActivityEvent", () => {
  it("classifies order creation with a null from_status as created", () => {
    expect(classifyActivityEvent({
      order_table: "orders",
      from_status: null,
      to_status: "pending",
    })).toBe("created");
  });

  it("classifies an approved/confirmed transition as confirmed", () => {
    expect(classifyActivityEvent({
      order_table: "orders",
      from_status: "pending",
      to_status: "approved",
    })).toBe("confirmed");
    expect(classifyActivityEvent({
      order_table: "social_inbox_orders",
      from_status: "pending",
      to_status: "confirmed",
    })).toBe("confirmed");
  });

  it("classifies a cancelled/rejected transition as cancelled", () => {
    expect(classifyActivityEvent({
      order_table: "orders",
      from_status: "approved",
      to_status: "cancelled",
    })).toBe("cancelled");
  });

  it("falls back to status_changed for any other order transition", () => {
    expect(classifyActivityEvent({
      order_table: "orders",
      from_status: "approved",
      to_status: "print",
    })).toBe("status_changed");
  });

  it("classifies detailed status events from their safe metadata", () => {
    expect(classifyActivityEvent({
      event_type: "order.status_changed",
      order_table: "orders",
      metadata: { from_status: "pending", to_status: "approved" },
    })).toBe("confirmed");
  });

  it("classifies every abandoned checkout status transition", () => {
    expect(classifyActivityEvent({ order_table: "abandoned_checkouts", from_status: "open", to_status: "contacted" })).toBe("contacted");
    expect(classifyActivityEvent({ order_table: "abandoned_checkouts", from_status: "contacted", to_status: "dismissed" })).toBe("dismissed");
    expect(classifyActivityEvent({ order_table: "abandoned_checkouts", from_status: "dismissed", to_status: "open" })).toBe("reopened");
    expect(classifyActivityEvent({ order_table: "abandoned_checkouts", from_status: "open", to_status: "recovered" })).toBe("converted");
    expect(classifyActivityEvent({ order_table: "abandoned_checkouts", from_status: "open", to_status: "expired" })).toBe("expired");
  });
});

describe("ACTIVITY_ORDER_TABLES", () => {
  it("includes abandoned_checkouts alongside the original two order tables", () => {
    expect(ACTIVITY_ORDER_TABLES).toEqual(["orders", "social_inbox_orders", "abandoned_checkouts"]);
  });
});

describe("resolveActivityTableFilter", () => {
  it("defaults to all when omitted", () => {
    expect(resolveActivityTableFilter(undefined)).toBe("all");
    expect(resolveActivityTableFilter("")).toBe("all");
  });

  it("accepts a known order table", () => {
    expect(resolveActivityTableFilter("abandoned_checkouts")).toBe("abandoned_checkouts");
  });

  it("rejects an unknown table", () => {
    expect(() => resolveActivityTableFilter("invoices")).toThrow("Invalid table filter");
  });
});

describe("resolveActivityActionFilter", () => {
  it("returns null when no filter is supplied", () => {
    expect(resolveActivityActionFilter(undefined)).toBeNull();
    expect(resolveActivityActionFilter("")).toBeNull();
  });

  it("parses and de-duplicates a comma list of valid actions", () => {
    expect(resolveActivityActionFilter("confirmed,cancelled,confirmed")).toEqual(["confirmed", "cancelled"]);
  });

  it("rejects an unknown action", () => {
    expect(() => resolveActivityActionFilter("confirmed,teleported")).toThrow("Invalid action filter");
  });
});

describe("resolveActivityPage", () => {
  it("defaults to 0 for missing, negative, or non-numeric input", () => {
    expect(resolveActivityPage(undefined)).toBe(0);
    expect(resolveActivityPage("-1")).toBe(0);
    expect(resolveActivityPage("abc")).toBe(0);
  });

  it("accepts a positive integer page", () => {
    expect(resolveActivityPage("3")).toBe(3);
  });
});

describe("activityFetchLimit", () => {
  it("overfetches enough to merge the requested page without scanning full history", () => {
    expect(activityFetchLimit(0)).toBe(100);
    expect(activityFetchLimit(3)).toBe(250);
    expect(activityFetchLimit(100)).toBe(1000);
  });
});

describe("buildOrderLookup and buildActivityLogEntry", () => {
  it("resolves the order reference and staff display name for a feed entry", () => {
    const orderLookup = buildOrderLookup({
      orders: [{ id: "order-1", order_number: 1042, price: 500 }],
      socialInboxOrders: [],
      abandonedCheckouts: [],
    });
    const staffById = new Map([["actor-1", "Rakib"]]);

    expect(orderLookup.get(orderReferenceKey("orders", "order-1"))).toEqual({
      label: "Order #1042",
      value: 500,
    });

    expect(buildActivityLogEntry({
      id: "event-1",
      order_id: "order-1",
      order_table: "orders",
      from_status: "pending",
      to_status: "approved",
      actor_id: "actor-1",
      created_at: "2026-09-22T10:00:00.000Z",
      action: "confirmed",
    }, { orderLookup, staffById })).toEqual({
      id: "event-1",
      occurred_at: "2026-09-22T10:00:00.000Z",
      action: "confirmed",
      order_table: "orders",
      order_id: "order-1",
      order_label: "Order #1042",
      order_value: 500,
      actor_id: "actor-1",
      actor_display_name: "Rakib",
    });
  });

  it("falls back to Unknown when the actor has left the roster", () => {
    const entry = buildActivityLogEntry({
      id: "event-2",
      order_id: "checkout-1",
      order_table: "abandoned_checkouts",
      from_status: "open",
      to_status: "dismissed",
      actor_id: "gone",
      created_at: "2026-09-22T10:00:00.000Z",
      action: "dismissed",
    }, { orderLookup: new Map(), staffById: new Map() });

    expect(entry.actor_display_name).toBe("Unknown");
    expect(entry.order_label).toBeNull();
  });
});
