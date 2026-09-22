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
  apiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      events,
      provenance: {
        origin_source: "website",
        created_at: "2026-09-22T09:35:26.000Z",
        assigned_to_display_name: null,
        last_edited_by: null,
        viewer_count: 1,
      },
    }),
  } as Response);
  return render(createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(OrderActivityTimeline, { endpoint: "/api/orders/order-1/activity" }),
  ));
}

beforeEach(() => apiFetch.mockReset());

describe("OrderActivityTimeline", () => {
  it("summarizes origin, latest activity, and history with semantic chips", async () => {
    renderTimeline();

    expect(await screen.findByText("Latest activity")).toBeInTheDocument();
    expect(screen.getByTestId("activity-log-icon")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("Website")).toHaveClass("bg-status-cyan-background");
    expect(screen.getByText("1 event")).toHaveClass("bg-status-purple-background");
    expect(screen.getAllByText("Order cancelled")[0]).toHaveClass("bg-status-rose-background");
    expect(screen.getByText(/Rakib ·/)).toBeInTheDocument();
    expect(screen.queryByText("Ownership")).not.toBeInTheDocument();
    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
    expect(screen.queryByText("Unassigned")).not.toBeInTheDocument();
  });

  it("uses distinct vibrant chip colors for different activity meanings", async () => {
    renderTimeline([
      { ...detailedEvent, id: "viewed", event_type: "order.viewed", summary: "Viewed order" },
      { ...detailedEvent, id: "history", event_type: "history.started", summary: "Detailed history started" },
      { ...detailedEvent, id: "created", event_type: "order.created", summary: "Order created" },
      { ...detailedEvent, id: "edited", event_type: "order.edited", summary: "Edited order" },
    ]);

    await screen.findByText("Latest activity");
    expect(screen.getAllByText("Viewed order")[0]).toHaveClass("bg-status-blue-background");
    expect(screen.getByText("Detailed history started")).toHaveClass("bg-status-yellow-background");
    expect(screen.getByText("Order created")).toHaveClass("bg-status-lime-background");
    expect(screen.getByText("Edited order")).toHaveClass("bg-status-purple-background");
  });

  it("shows a compact overview and reveals details when its row is clicked", async () => {
    renderTimeline();

    const row = await screen.findByTestId("activity-event");
    expect(within(row).getByText(/Order cancelled/)).toBeInTheDocument();
    expect(within(row).getByText("Order cancelled")).toHaveClass("bg-status-rose-background");
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
