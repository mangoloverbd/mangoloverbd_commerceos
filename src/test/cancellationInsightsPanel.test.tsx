import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CancellationInsights, type CancellationInsightsProps } from "@/components/orders/CancellationInsights";
import { CancellationReasonCell, CancelledAtCell } from "@/components/orders/CancellationReasonCell";
import type { CancelledOrder } from "@/lib/cancellationInsights";

vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const orders: CancelledOrder[] = [
  { id: "1", phone: "01712345678", created_at: "2026-09-30T06:00:00Z", cancelled_at: "2026-09-30T08:00:00Z", cancellation_reason_code: "customer_unreachable", price: 1000, delivery_rate: 100 },
  { id: "2", phone: "+8801712345678", created_at: "2026-09-29T06:00:00Z", cancelled_at: "2026-09-29T08:00:00Z", cancellation_reason_code: "customer_unreachable", price: 500, delivery_rate: 0 },
  { id: "3", phone: "01811111111", created_at: "2026-09-28T06:00:00Z", cancelled_at: null, cancellation_reason_code: null, price: 900, delivery_rate: 100 },
];

function renderPanel(overrides: Partial<CancellationInsightsProps> = {}) {
  const props: CancellationInsightsProps = {
    rangeOrders: orders, allCancelled: orders, listOrders: orders, selectedOrders: [],
    preset: "all", onPresetChange: vi.fn(), customRange: null, onCustomRangeChange: vi.fn(),
    basis: "cancelled", onBasisChange: vi.fn(), reasons: new Set(), onToggleReason: vi.fn(), onClearReasons: vi.fn(),
    ...overrides,
  };
  render(<CancellationInsights {...props} />);
  return props;
}

describe("CancellationInsights", () => {
  it("summarises the list and ranks reasons", () => {
    renderPanel();
    expect(screen.getByTestId("cancellation-stat-cancelled")).toHaveTextContent("3");
    expect(screen.getByTestId("cancellation-stat-customers")).toHaveTextContent("2");
    expect(screen.getByTestId("cancellation-stat-repeat-cancellers")).toHaveTextContent("1");
    expect(screen.getByTestId("cancellation-reason-customer_unreachable")).toHaveTextContent("Customer unreachable2 · 67%");
    expect(screen.getByTestId("cancellation-reason-none")).toHaveTextContent("No reason recorded1 · 33%");
  });

  it("filters by reason and date from its controls", () => {
    const props = renderPanel({ reasons: new Set(["customer_unreachable"]) });
    fireEvent.click(screen.getByTestId("cancellation-reason-none"));
    expect(props.onToggleReason).toHaveBeenCalledWith("none");
    fireEvent.click(screen.getByRole("button", { name: "Remove filter Customer unreachable" }));
    expect(props.onToggleReason).toHaveBeenCalledWith("customer_unreachable");
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(props.onPresetChange).toHaveBeenCalledWith("7d");
    fireEvent.click(screen.getByRole("button", { name: "Order date" }));
    expect(props.onBasisChange).toHaveBeenCalledWith("ordered");
  });

  it("copies each customer's phone once, preferring the selected orders", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPanel({ selectedOrders: orders.slice(0, 2) });
    fireEvent.click(screen.getByRole("button", { name: "Copy 1 phone" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("01712345678"));
    expect(screen.getByRole("button", { name: "Export CSV (2)" })).toBeEnabled();
  });

  it("shows the reason and note in the table cell", () => {
    render(<CancellationReasonCell order={{ ...orders[0], cancellation_reason_note: "3 calls, no answer" }} />);
    const cell = screen.getByTestId("cancellation-reason-cell-1");
    expect(cell).toHaveTextContent("Customer unreachable");
    expect(cell).toHaveTextContent("3 calls, no answer");
  });

  it("shows when the order was cancelled in its own cell", () => {
    render(<CancelledAtCell order={orders[0]} />);
    expect(screen.getByTestId("cancelled-at-cell-1")).toHaveTextContent(/Sep 30, 2026/);
  });
});
