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

function renderTimeline(events = [detailedEvent], variant?: "compact" | "full") {
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
    createElement(OrderActivityTimeline, { endpoint: "/api/orders/order-1/activity", variant }),
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

  it("shows the full history with a live indicator in the full variant", async () => {
    renderTimeline(Array.from({ length: 7 }, (_, index) => ({
      ...detailedEvent,
      id: `event-${index}`,
      summary: `Event ${index + 1}`,
    })), "full");

    expect(await screen.findAllByTestId("activity-event")).toHaveLength(7);
    expect(screen.queryByRole("button", { name: "View all activity" })).not.toBeInTheDocument();
    expect(screen.getByTestId("activity-live-indicator")).toHaveTextContent("Live");
  });

  it("always shows event details expanded in the full variant", async () => {
    renderTimeline([detailedEvent], "full");

    const row = await screen.findByTestId("activity-event");
    expect(within(row).getByText("Customer changed their mind")).toBeInTheDocument();
    expect(within(row).getByText("Customer called after confirmation")).toBeInTheDocument();
    const status = within(row).getByTestId("activity-status-change");
    expect(status).toHaveTextContent("Approved");
    expect(status).toHaveTextContent("Cancelled");
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a status change as readable before and after status chips", async () => {
    renderTimeline([{
      id: "status-1",
      occurred_at: "2026-09-23T05:43:57.000Z",
      event_type: "order.status_changed",
      actor_display_name: "Jannat",
      summary: "Status changed to confirmed",
      changes: [{ type: "field_changed", field: "status", label: "Status", before: "pending", after: "confirmed" }],
    }], "full");

    const row = await screen.findByTestId("activity-event");
    expect(within(row).getByText("Status changed")).toBeInTheDocument();
    const status = within(row).getByTestId("activity-status-change");
    expect(within(status).getByText("Pending")).toBeInTheDocument();
    expect(within(status).getByText("Approved")).toBeInTheDocument();
    expect(row).not.toHaveTextContent("pending");
  });

  it("explains edited order items with action chips, a summary, and taka impact", async () => {
    renderTimeline([{
      id: "items-1",
      occurred_at: "2026-09-23T05:44:58.000Z",
      event_type: "order.edited",
      actor_display_name: "Jannat",
      summary: "Edited order items",
      changes: [
        { type: "field_changed", field: "total_price", label: "Order total", before: 700, after: 400 },
        { type: "item_added", item_key: "p1:v1", label: "Pumpkin Bori · ৫০০ গ্রাম", before: 0, after: 1, quantity_delta: 1, amount_delta: 200, addition_reason: "upsell" },
        { type: "item_removed", item_key: "p1:v2", label: 'Pumpkin Bori · {"size":"১ কেজি"}', before: 1, after: 0, quantity_delta: -1, amount_delta: -500 },
        { type: "field_changed", field: "delivery_rate", label: "Delivery fee", before: 80, after: 0 },
      ],
    }], "full");

    const row = await screen.findByTestId("activity-event");
    const summary = within(row).getByTestId("activity-items-summary");
    expect(summary).toHaveTextContent("1 changed");
    expect(summary).toHaveTextContent("Total ৳700 → ৳400");
    expect(summary).toHaveTextContent("−৳300");

    const items = within(row).getAllByTestId("activity-item-change");
    // Same product, same quantity, different size: one "Size changed" row.
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("↔ Size changed");
    expect(items[0]).toHaveTextContent("Pumpkin Bori · ১ কেজি → ৫০০ গ্রাম");
    expect(items[0]).toHaveTextContent("×1");
    expect(items[0]).toHaveTextContent("Upsell");
    expect(items[0]).toHaveTextContent("−৳300");
    expect(row).not.toHaveTextContent('{"size"');

    const field = within(row).getByTestId("activity-field-change");
    expect(field).toHaveTextContent("Delivery fee");
    expect(field).toHaveTextContent("৳80");
    expect(field).toHaveTextContent("৳0");
  });

  it("uses the row's middle space for the change and keeps the exact time under the heading", async () => {
    const occurredAt = "2026-09-23T06:36:37.000Z";
    renderTimeline([{
      id: "status-2",
      occurred_at: occurredAt,
      event_type: "order.status_changed",
      actor_display_name: "Jannat",
      summary: "Status changed to confirmed",
      changes: [{ type: "field_changed", field: "status", label: "Status", before: "pending", after: "confirmed" }],
    }], "full");

    const row = await screen.findByTestId("activity-event");
    const inline = within(row).getByTestId("activity-event-inline");
    expect(within(inline).getByTestId("activity-status-change")).toHaveTextContent("Pending");
    expect(row).toHaveClass("sm:grid-cols-[minmax(14rem,1fr)_auto_minmax(14rem,1fr)]");
    expect(inline).toHaveClass("sm:items-center", "sm:text-center");
    const exactTime = new Date(occurredAt).toLocaleString("en-BD");
    expect(within(row).getByTestId("activity-event-heading")).toHaveTextContent(exactTime);
    expect(within(row).getByTestId("activity-event-time")).not.toHaveTextContent(exactTime);
  });

  it("keeps the item summary inline and lists item rows beneath it", async () => {
    renderTimeline([{
      id: "items-2",
      occurred_at: "2026-09-23T05:44:58.000Z",
      event_type: "order.edited",
      actor_display_name: "Jannat",
      summary: "Edited order items",
      changes: [
        { type: "field_changed", field: "total_price", label: "Order total", before: 700, after: 400 },
        { type: "item_added", item_key: "p1:v1", label: "Pumpkin Bori", before: 0, after: 1, amount_delta: 200, addition_reason: "upsell" },
        { type: "field_changed", field: "delivery_rate", label: "Delivery fee", before: 80, after: 0 },
      ],
    }], "full");

    const row = await screen.findByTestId("activity-event");
    const inline = within(row).getByTestId("activity-event-inline");
    expect(within(inline).getByTestId("activity-items-summary")).toBeInTheDocument();
    expect(within(inline).queryByTestId("activity-item-change")).not.toBeInTheDocument();
    const list = within(row).getByTestId("activity-event-changes");
    expect(within(list).getByTestId("activity-item-change")).toBeInTheDocument();
    expect(within(list).getByTestId("activity-field-change")).toHaveTextContent("Delivery fee");
  });

  it("shows field-only edits and reasons inline", async () => {
    renderTimeline([{
      id: "field-1",
      occurred_at: "2026-09-23T05:44:58.000Z",
      event_type: "order.edited",
      actor_display_name: "Sumon",
      summary: "Edited order",
      reason_code: "customer_request",
      changes: [{ type: "field_changed", field: "delivery_rate", label: "Delivery fee", before: 80, after: 0 }],
    }], "full");

    const row = await screen.findByTestId("activity-event");
    const inline = within(row).getByTestId("activity-event-inline");
    expect(within(inline).getByTestId("activity-field-change")).toHaveTextContent("Delivery fee");
    expect(inline).toHaveTextContent("Customer request");
    expect(within(row).queryByTestId("activity-event-changes")).not.toBeInTheDocument();
  });

  it("does not repeat the order discount below when it exactly explains the total change", async () => {
    renderTimeline([{
      id: "discount-total-1",
      occurred_at: "2026-09-23T05:44:58.000Z",
      event_type: "order.edited",
      actor_display_name: "Tanim",
      summary: "Edited order",
      changes: [
        { type: "field_changed", field: "price", label: "Order total", before: 700, after: 0 },
        { type: "field_changed", field: "discount", label: "Order discount", before: 0, after: 700 },
      ],
    }], "full");

    const row = await screen.findByTestId("activity-event");
    const summary = within(row).getByTestId("activity-items-summary");
    expect(summary).toHaveTextContent("Total ৳700 → ৳0");
    expect(summary).toHaveTextContent("−৳700");
    expect(row).not.toHaveTextContent("Order discount");
    expect(within(row).queryByTestId("activity-event-changes")).not.toBeInTheDocument();
  });

  it("keeps the compact popover's plain before and after table", async () => {
    renderTimeline([detailedEvent]);

    fireEvent.click(await screen.findByRole("button", { name: "Expand: Order cancelled" }));

    const row = screen.getByTestId("activity-event");
    expect(within(row).getByText("confirmed")).toBeInTheDocument();
    expect(within(row).queryByTestId("activity-status-change")).not.toBeInTheDocument();
  });

  it("polls for new activity every ten seconds in the full variant", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderTimeline([detailedEvent], "full");
      await screen.findByTestId("activity-event");
      const callsAfterLoad = apiFetch.mock.calls.length;

      await vi.advanceTimersByTimeAsync(2_100);
      expect(apiFetch.mock.calls.length).toBe(callsAfterLoad);

      await vi.advanceTimersByTimeAsync(8_000);
      expect(apiFetch.mock.calls.length).toBeGreaterThan(callsAfterLoad);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not poll in the default compact variant", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderTimeline();
      await screen.findByTestId("activity-event");
      const callsAfterLoad = apiFetch.mock.calls.length;

      await vi.advanceTimersByTimeAsync(5_100);

      expect(apiFetch.mock.calls.length).toBe(callsAfterLoad);
      expect(screen.queryByTestId("activity-live-indicator")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
