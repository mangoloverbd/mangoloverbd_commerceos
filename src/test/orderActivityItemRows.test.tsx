import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrderActivityChangeList } from "@/components/OrderActivityChangeDetails";
import { layoutActivityChanges } from "@/lib/orderActivityPresentation";

describe("activity item rows", () => {
  it("renders a size swap as a single Size changed row", () => {
    render(<OrderActivityChangeList layout={layoutActivityChanges([
      { type: "item_added", item_key: "p1:v500", label: "Pumpkin Bori · ৫০০ গ্রাম", before: 0, after: 1, amount_delta: 400 },
      { type: "item_removed", item_key: "p1:v1kg", label: "Pumpkin Bori · ১ কেজি", before: 1, after: 0, amount_delta: -700 },
    ])} />);

    const rows = screen.getAllByTestId("activity-item-change");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("↔ Size changed");
    expect(rows[0]).toHaveTextContent("Pumpkin Bori · ১ কেজি → ৫০০ গ্রাম");
    expect(rows[0]).toHaveTextContent("×1");
    expect(rows[0]).toHaveTextContent("−৳300");
  });
});
