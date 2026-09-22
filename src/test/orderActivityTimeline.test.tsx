import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderActivityTimeline } from "@/components/OrderActivityTimeline";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));

const detailedEvent = {
  id: "event-1",
  occurred_at: "2026-09-22T10:00:00.000Z",
  event_type: "order.cancelled",
  actor_display_name: "Rakib",
  summary: "Order cancelled",
  reason_code: "customer_changed_mind",
  reason_note: "Customer called after confirmation",
  changes: [{ field: "status", label: "Status", before: "confirmed", after: "cancelled" }],
};

function renderTimeline(events = [detailedEvent]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ events }) } as Response);
  return render(createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(OrderActivityTimeline, { endpoint: "/api/orders/order-1/activity" }),
  ));
}

beforeEach(() => apiFetch.mockReset());

describe("OrderActivityTimeline", () => {
  it("shows a compact overview and reveals details when its row is clicked", async () => {
    renderTimeline();

    const row = await screen.findByTestId("activity-event");
    expect(within(row).getByText(/Order cancelled/)).toBeInTheDocument();
    expect(within(row).getByText(/by Rakib/)).toBeInTheDocument();
    expect(within(row).queryByText("Customer changed their mind")).not.toBeInTheDocument();
    expect(within(row).queryByText("confirmed")).not.toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: "Expand: Order cancelled" }));

    expect(within(row).getByText("Customer changed their mind")).toBeInTheDocument();
    expect(within(row).getByText("Customer called after confirmation")).toBeInTheDocument();
    expect(within(row).getByText("confirmed")).toBeInTheDocument();
    expect(within(row).getByText("cancelled")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Collapse: Order cancelled" })).toHaveAttribute("aria-expanded", "true");
  });

  it("shows five recent overviews until the full log is requested", async () => {
    renderTimeline(Array.from({ length: 7 }, (_, index) => ({
      ...detailedEvent,
      id: `event-${index}`,
      summary: `Event ${index + 1}`,
    })));

    expect(await screen.findAllByTestId("activity-event")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "View all activity" }));
    expect(screen.getAllByTestId("activity-event")).toHaveLength(7);
  });
});
