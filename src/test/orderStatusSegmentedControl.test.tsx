import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OrderStatusSegmentedControl } from "@/components/orders/OrderStatusSegmentedControl";

const counts = {
  all: 127939,
  pending: 707,
  on_hold: 0,
  approved: 102,
  processing: 0,
  ready_to_ship: 57432,
  in_transit: 2,
  delivered: 37678,
  flagged: 1342,
  cancelled: 30676,
};

describe("OrderStatusSegmentedControl", () => {
  it("renders the complete fulfillment pipeline with formatted counts", () => {
    render(<OrderStatusSegmentedControl counts={counts} value="all" onChange={vi.fn()} />);

    expect(screen.getByRole("radiogroup", { name: "Filter orders by status" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /All Orders.*127,939/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Ready To Ship.*57,432/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /In-Transit.*2/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Cancelled.*30,676/ })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(10);
  });

  it("reports the selected status", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OrderStatusSegmentedControl counts={counts} value="all" onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: /Delivered.*37,678/ }));

    expect(onChange).toHaveBeenCalledWith("delivered");
  });

  it("renders stable placeholders while counts are loading", () => {
    render(<OrderStatusSegmentedControl counts={counts} value="all" onChange={vi.fn()} loading />);

    expect(screen.getByRole("radio", { name: /All Orders.*loading/ })).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(10);
  });

  it("uses a full-width gray tray with neutral count text", () => {
    render(<OrderStatusSegmentedControl counts={counts} value="all" onChange={vi.fn()} />);

    expect(screen.getByTestId("order-status-scroll-container")).toHaveClass("w-full");
    expect(screen.getByTestId("order-status-control")).toHaveClass(
      "xl:grid",
      "xl:grid-cols-10",
      "xl:w-full",
      "rounded-xl",
      "bg-black/[0.045]",
      "p-1",
    );
    expect(screen.getByRole("radio", { name: /Delivered.*37,678/ })).toHaveClass("xl:min-w-0");
    expect(screen.getByTestId("order-status-count-delivered")).toHaveClass("text-black/80");
    expect(screen.getByTestId("order-status-count-delivered").className).not.toMatch(/text-emerald/);
  });
});
