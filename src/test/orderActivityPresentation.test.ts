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
