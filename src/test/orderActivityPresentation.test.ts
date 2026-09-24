import { describe, expect, it } from "vitest";
import {
  activityStatusColor,
  activityStatusLabel,
  cleanActivityItemLabel,
  formatActivityFieldValue,
  formatSignedTaka,
  groupActivityChanges,
  itemChangeKind,
  layoutActivityChanges,
  readableActivitySummary,
  summarizeItemChanges,
} from "@/lib/orderActivityPresentation";

describe("order activity presentation", () => {
  it("uses the app's status names and semantic colors", () => {
    expect(activityStatusLabel("pending")).toBe("Pending");
    expect(activityStatusLabel("confirmed")).toBe("Approved");
    expect(activityStatusLabel("on_hold")).toBe("On Hold");
    expect(activityStatusLabel("ready_to_ship")).toBe("Ready To Ship");
    expect(activityStatusLabel(null)).toBe("Not set");
    expect(activityStatusColor("pending")).toBe("yellow");
    expect(activityStatusColor("confirmed")).toBe("blue");
    expect(activityStatusColor("delivered")).toBe("lime");
    expect(activityStatusColor("cancelled")).toBe("rose");
    expect(activityStatusColor("something_else")).toBe("neutral");
  });

  it("classifies typed and legacy item changes", () => {
    expect(itemChangeKind({ type: "item_added", before: 0, after: 1 })).toBe("added");
    expect(itemChangeKind({ type: "item_removed", before: 1, after: 0 })).toBe("removed");
    expect(itemChangeKind({ type: "item_quantity_increased", before: 1, after: 3 })).toBe("increased");
    expect(itemChangeKind({ type: "item_quantity_decreased", before: 3, after: 1 })).toBe("decreased");
    expect(itemChangeKind({ type: "item_discount_changed", before: 0, after: 50 })).toBe("discount");
    expect(itemChangeKind({ item_key: "p:", before: 0, after: 2 })).toBe("added");
    expect(itemChangeKind({ item_key: "p:", before: 2, after: 0 })).toBe("removed");
  });

  it("turns raw variant JSON into readable text", () => {
    expect(cleanActivityItemLabel('Pumpkin Bori · {"size":"১ কেজি"}')).toBe("Pumpkin Bori · ১ কেজি");
    expect(cleanActivityItemLabel('Honey · {"size":"500g","flavor":"Litchi"}')).toBe("Honey · 500g / Litchi");
    expect(cleanActivityItemLabel("Pumpkin Bori · ৫০০ গ্রাম")).toBe("Pumpkin Bori · ৫০০ গ্রাম");
  });

  it("groups status, order total, item, and other field changes", () => {
    const grouped = groupActivityChanges([
      { type: "field_changed", field: "status", before: "pending", after: "confirmed" },
      { type: "field_changed", field: "total_price", label: "Order total", before: 700, after: 400 },
      { type: "field_changed", field: "price", label: "Order total", before: 700, after: 400 },
      { type: "field_changed", field: "delivery_rate", label: "Delivery fee", before: 80, after: 0 },
      { type: "item_added", item_key: "a:", label: "A", before: 0, after: 1 },
      { type: "item_removed", item_key: "b:", label: "B", before: 1, after: 0 },
    ]);

    expect(grouped.status?.after).toBe("confirmed");
    expect(grouped.total?.field).toBe("total_price");
    expect(grouped.items).toHaveLength(2);
    expect(grouped.fields.map((change) => change.field)).toEqual(["delivery_rate"]);
  });

  it("keeps lone field edits inline and moves them below a status or item headline", () => {
    const delivery = { type: "field_changed", field: "delivery_rate", label: "Delivery fee", before: 80, after: 0 };
    const alone = layoutActivityChanges([delivery]);
    expect(alone.inlineFields).toHaveLength(1);
    expect(alone.listFields).toHaveLength(0);

    const withStatus = layoutActivityChanges([
      { type: "field_changed", field: "status", before: "pending", after: "confirmed" },
      delivery,
    ]);
    expect(withStatus.inlineFields).toHaveLength(0);
    expect(withStatus.listFields).toHaveLength(1);
  });

  it("hides an order discount field when its full change is already shown by the total", () => {
    const redundant = layoutActivityChanges([
      { type: "field_changed", field: "price", label: "Order total", before: 700, after: 0 },
      { type: "field_changed", field: "discount", label: "Order discount", before: 0, after: 700 },
    ]);
    expect(redundant.fields).toEqual([]);
    expect(redundant.listFields).toEqual([]);

    const distinct = layoutActivityChanges([
      { type: "field_changed", field: "price", label: "Order total", before: 700, after: 200 },
      { type: "field_changed", field: "discount", label: "Order discount", before: 0, after: 700 },
    ]);
    expect(distinct.fields).toHaveLength(1);
    expect(distinct.listFields).toHaveLength(1);
  });

  it("hides the order discount when added or removed items' own discounts explain it", () => {
    // ML-151314: honey added at ৳1,600 with ৳600 off; order discount 300 → 900 is just that line discount.
    const itemOnly = layoutActivityChanges([
      { type: "field_changed", field: "discount", label: "Order discount", before: 300, after: 900 },
      { type: "field_changed", field: "price", label: "Order total", before: 950, after: 1950 },
      { type: "item_added", label: "Honey · 1KG", before: 0, after: 1, amount_delta: 1000, quantity_delta: 1 },
    ]);
    expect(itemOnly.fields).toEqual([]);
    expect(itemOnly.listFields).toEqual([]);
    expect(itemOnly.items).toHaveLength(1);
    expect(itemOnly.total?.after).toBe(1950);

    // Staff also changed the whole-order discount: total no longer equals the item delta, so keep it.
    const alsoOrderDiscount = layoutActivityChanges([
      { type: "field_changed", field: "discount", label: "Order discount", before: 300, after: 1100 },
      { type: "field_changed", field: "price", label: "Order total", before: 950, after: 1750 },
      { type: "item_added", label: "Honey · 1KG", before: 0, after: 1, amount_delta: 1000, quantity_delta: 1 },
    ]);
    expect(alsoOrderDiscount.listFields.map((field) => field.field)).toEqual(["discount"]);

    // Other field edits in the same event stay visible.
    const withDelivery = layoutActivityChanges([
      { type: "field_changed", field: "discount", label: "Order discount", before: 300, after: 900 },
      { type: "field_changed", field: "delivery_rate", label: "Delivery", before: 100, after: 120 },
      { type: "field_changed", field: "price", label: "Order total", before: 950, after: 1950 },
      { type: "item_added", label: "Honey · 1KG", before: 0, after: 1, amount_delta: 1000, quantity_delta: 1 },
    ]);
    expect(withDelivery.listFields.map((field) => field.field)).toEqual(["delivery_rate"]);
  });

  it("hides a subtotal that only repeats the item changes", () => {
    const layout = layoutActivityChanges([
      { type: "field_changed", field: "delivery_rate", label: "Delivery fee", before: 100, after: 0 },
      { type: "field_changed", field: "subtotal", label: "Subtotal", before: 400, after: 700 },
      { type: "field_changed", field: "total", label: "Order total", before: 500, after: 700 },
      { type: "item_added", item_key: "Bori:১ কেজি", label: "Bori · ১ কেজি", before: 0, after: 1, amount_delta: 700 },
      { type: "item_removed", item_key: "Bori:৫০০ গ্রাম", label: "Bori · ৫০০ গ্রাম", before: 1, after: 0, amount_delta: -400 },
    ]);
    expect(layout.listFields.map((field) => field.field)).toEqual(["delivery_rate"]);

    const unexplained = layoutActivityChanges([
      { type: "field_changed", field: "subtotal", label: "Subtotal", before: 400, after: 900 },
      { type: "item_added", item_key: "Bori:১ কেজি", label: "Bori · ১ কেজি", before: 0, after: 1, amount_delta: 700 },
    ]);
    expect(unexplained.listFields.map((field) => field.field)).toEqual(["subtotal"]);
  });

  it("merges a same-product size swap into one size change row", () => {
    const layout = layoutActivityChanges([
      { type: "field_changed", field: "price", label: "Order total", before: 700, after: 400 },
      { type: "item_added", item_key: "p1:v500", label: "Pumpkin Bori · ৫০০ গ্রাম", before: 0, after: 1, amount_delta: 400, quantity_delta: 1 },
      { type: "item_removed", item_key: "p1:v1kg", label: 'Pumpkin Bori · {"size":"১ কেজি"}', before: 1, after: 0, amount_delta: -700, quantity_delta: -1 },
    ]);
    expect(layout.items).toHaveLength(1);
    expect(layout.items[0]).toMatchObject({ type: "item_variant_changed", label: "Pumpkin Bori", before: "১ কেজি", after: "৫০০ গ্রাম", amount_delta: -300, quantity: 1 });
    expect(itemChangeKind(layout.items[0])).toBe("variant");
    expect(summarizeItemChanges(layout.items)).toBe("1 changed");

    const differentProducts = layoutActivityChanges([
      { type: "item_added", item_key: "p2:v1", label: "Honey · ১ কেজি", before: 0, after: 1, amount_delta: 700 },
      { type: "item_removed", item_key: "p1:v1kg", label: "Pumpkin Bori · ১ কেজি", before: 1, after: 0, amount_delta: -700 },
    ]);
    expect(differentProducts.items.map((item) => item.type)).toEqual(["item_added", "item_removed"]);

    const differentQuantity = layoutActivityChanges([
      { type: "item_added", item_key: "p1:v500", label: "Pumpkin Bori · ৫০০ গ্রাম", before: 0, after: 2, amount_delta: 800 },
      { type: "item_removed", item_key: "p1:v1kg", label: "Pumpkin Bori · ১ কেজি", before: 1, after: 0, amount_delta: -700 },
    ]);
    expect(differentQuantity.items).toHaveLength(2);
  });

  it("summarizes item changes and formats taka values", () => {
    expect(summarizeItemChanges([
      { type: "item_added", before: 0, after: 1 },
      { type: "item_added", before: 0, after: 2 },
      { type: "item_removed", before: 1, after: 0 },
      { type: "item_quantity_increased", before: 1, after: 2 },
    ])).toBe("2 added · 1 removed · 1 changed");
    expect(formatSignedTaka(200)).toBe("+৳200");
    expect(formatSignedTaka(-300)).toBe("−৳300");
    expect(formatSignedTaka(0)).toBe("৳0");
    expect(formatActivityFieldValue("delivery_rate", 80)).toBe("৳80");
    expect(formatActivityFieldValue("phone", "01711111111")).toBe("01711111111");
    expect(formatActivityFieldValue("address", "")).toBe("Not set");
  });
});

describe("readableActivitySummary", () => {
  it("names approvals and status moves in plain words", () => {
    expect(readableActivitySummary("Status changed to confirmed")).toBe("Approved order");
    expect(readableActivitySummary("Status changed to approved")).toBe("Approved order");
    expect(readableActivitySummary("Status changed to cancelled")).toBe("Cancelled order");
    expect(readableActivitySummary("Status changed to print")).toBe("Moved to Print");
    expect(readableActivitySummary("Status changed to processing")).toBe("Moved to Processing");
    expect(readableActivitySummary("Status changed to on_hold")).toBe("Moved to On Hold");
  });

  it("turns raw courier status codes into readable text", () => {
    expect(readableActivitySummary("Steadfast status changed to delivered")).toBe("Steadfast: Delivered");
    expect(readableActivitySummary("Steadfast status changed to delivered_approval_pending")).toBe("Steadfast: Delivered (awaiting approval)");
    expect(readableActivitySummary("Pathao status changed to partial_delivered_approval_pending")).toBe("Pathao: Partial Delivered (awaiting approval)");
  });

  it("names where an order was created", () => {
    expect(readableActivitySummary("Order created through manual_other")).toBe("Created order · Manual entry");
    expect(readableActivitySummary("Order created through facebook")).toBe("Created order · Facebook");
    expect(readableActivitySummary("Order created from abandoned checkout")).toBe("Created order from abandoned cart");
  });

  it("describes abandoned-cart follow-ups", () => {
    expect(readableActivitySummary("Checkout marked dismissed")).toBe("Dismissed abandoned cart");
    expect(readableActivitySummary("Checkout marked contacted")).toBe("Contacted cart customer");
    expect(readableActivitySummary("Checkout marked open")).toBe("Reopened abandoned cart");
  });

  it("keeps summaries that are already readable, and falls back when empty", () => {
    expect(readableActivitySummary("Edited order items")).toBe("Edited order items");
    expect(readableActivitySummary(null, "Updated")).toBe("Updated");
  });
});
