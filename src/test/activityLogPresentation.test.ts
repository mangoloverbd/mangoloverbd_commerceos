import { describe, expect, it } from "vitest";
import {
  activityActionColor,
  activityActionLabel,
  activityOrderLink,
  activityTableLabel,
  groupActivityEventsByDay,
  type ActivityEvent,
} from "@/lib/activityLogPresentation";

function makeEvent(overrides: Partial<ActivityEvent>): ActivityEvent {
  return {
    id: "event-1",
    occurred_at: "2026-09-22T10:00:00.000Z",
    action: "confirmed",
    order_table: "orders",
    order_id: "order-1",
    order_label: "Order #1",
    order_value: 500,
    actor_id: "actor-1",
    actor_display_name: "Rakib",
    ...overrides,
  };
}

describe("activityActionLabel / activityActionColor", () => {
  it("labels every action with a human-readable string", () => {
    expect(activityActionLabel("confirmed")).toBe("Confirmed");
    expect(activityActionLabel("converted")).toBe("Converted to order");
    expect(activityActionLabel("status_changed")).toBe("Updated");
  });

  it("colors positive and negative outcomes distinctly", () => {
    expect(activityActionColor("confirmed")).toBe("lime");
    expect(activityActionColor("cancelled")).toBe("rose");
    expect(activityActionColor("dismissed")).toBe("rose");
    expect(activityActionColor("contacted")).toBe("blue");
  });
});

describe("activityTableLabel", () => {
  it("labels each order table", () => {
    expect(activityTableLabel("orders")).toBe("Order");
    expect(activityTableLabel("social_inbox_orders")).toBe("Inbox order");
    expect(activityTableLabel("abandoned_checkouts")).toBe("Abandoned cart");
  });
});

describe("activityOrderLink", () => {
  it("links a regular order to its editor", () => {
    expect(activityOrderLink({ order_table: "orders", order_id: "abc" })).toBe("/orders/abc");
  });

  it("links an abandoned checkout to its editor", () => {
    expect(activityOrderLink({ order_table: "abandoned_checkouts", order_id: "abc" })).toBe("/abandoned/abc");
  });

  it("has no dedicated detail route for social inbox orders", () => {
    expect(activityOrderLink({ order_table: "social_inbox_orders", order_id: "abc" })).toBeNull();
  });
});

describe("groupActivityEventsByDay", () => {
  it("groups consecutive same-Dhaka-day events into one bucket", () => {
    const events = [
      makeEvent({ id: "1", occurred_at: "2026-09-22T17:59:00.000Z" }), // 23:59 Dhaka
      makeEvent({ id: "2", occurred_at: "2026-09-22T10:00:00.000Z" }), // 16:00 Dhaka, same day
      makeEvent({ id: "3", occurred_at: "2026-09-21T10:00:00.000Z" }), // previous Dhaka day
    ];

    const groups = groupActivityEventsByDay(events);
    expect(groups).toHaveLength(2);
    expect(groups[0].events.map((event) => event.id)).toEqual(["1", "2"]);
    expect(groups[1].events.map((event) => event.id)).toEqual(["3"]);
  });
});
