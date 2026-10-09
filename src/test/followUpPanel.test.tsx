import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FollowUpPanel, sortFollowUpNewestFirst } from "@/components/orders/FollowUpPanel";
import type { FollowUpReasonKey } from "@/lib/orderStatusFilters";

function setup(overrides: Partial<Parameters<typeof FollowUpPanel>[0]> = {}) {
  const props = {
    reasonCounts: { delivery_problem: 96, no_movement: 27, in_transit_long: 0, courier_unknown: 13 },
    listCount: 136,
    selectedCount: 0,
    reasons: new Set<FollowUpReasonKey>(),
    onToggleReason: vi.fn(),
    onClearReasons: vi.fn(),
    onMarkFollowedUp: vi.fn(async () => {}),
    ...overrides,
  };
  render(<FollowUpPanel {...props} />);
  return props;
}

describe("Follow up panel", () => {
  it("shows one compact tile per reason with what it means, a bar and its count", () => {
    setup();
    expect(screen.getByTestId("follow-up-reason-delivery_problem")).toHaveTextContent("Delivery problemRider reported a problem96");
    expect(screen.getByTestId("follow-up-reason-no_movement")).toHaveTextContent("No movementNot picked up for 4+ days27");
    expect(screen.getByTestId("follow-up-reason-in_transit_long")).toHaveTextContent("In transit too longOn the way for 5+ days0");
    expect(screen.getByTestId("follow-up-reason-courier_unknown")).toHaveTextContent("Steadfast doesn't knowAsk Steadfast support13");
    // The bar is sized against the biggest reason.
    expect(screen.getByTestId("follow-up-bar-delivery_problem")).toHaveAttribute("data-share", "100");
    expect(screen.getByTestId("follow-up-bar-no_movement")).toHaveAttribute("data-share", "28");
  });

  it("filters by a tile, shows the active filter and clears it", () => {
    const props = setup();
    fireEvent.click(screen.getByTestId("follow-up-reason-delivery_problem"));
    expect(props.onToggleReason).toHaveBeenCalledWith("delivery_problem");
  });

  it("marks the active tile and offers to show all again", () => {
    const props = setup({ reasons: new Set<FollowUpReasonKey>(["no_movement"]), listCount: 27 });
    expect(screen.getByTestId("follow-up-reason-no_movement")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/27 parcels · newest first/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(props.onClearReasons).toHaveBeenCalled();
  });

  it("explains how to follow up when nothing is selected", () => {
    setup();
    expect(screen.getByText(/Tick the parcels you called/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /followed up/ })).not.toBeInTheDocument();
  });

  it("marks the selected parcels followed up with an optional note", async () => {
    const props = setup({ selectedCount: 2 });
    fireEvent.change(screen.getByPlaceholderText(/Add a note/), { target: { value: "Customer will receive tomorrow" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark 2 followed up" }));
    await waitFor(() => expect(props.onMarkFollowedUp).toHaveBeenCalledWith("Customer will receive tomorrow"));
    await waitFor(() => expect(screen.getByPlaceholderText(/Add a note/)).toHaveValue(""));
  });

  it("lists the newest orders first", () => {
    const orders = [
      { id: "old", created_at: "2026-09-20T06:00:00Z" },
      { id: "new", created_at: "2026-10-08T06:00:00Z" },
      { id: "mid", created_at: "2026-10-01T06:00:00Z" },
    ];
    expect(sortFollowUpNewestFirst(orders).map((order) => order.id)).toEqual(["new", "mid", "old"]);
  });
});
