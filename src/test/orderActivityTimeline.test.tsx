import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { OrderActivityTimeline } from "@/components/OrderActivityTimeline";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));

function makeEvents(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `event-${index}`,
    occurred_at: "2026-09-22T10:00:00.000Z",
    action: index === 0 ? "cancelled" : "status_changed",
    actor_id: "actor-1",
    actor_display_name: "Rakib",
    from_status: "confirmed",
    to_status: index === 0 ? "cancelled" : "print",
  }));
}

function renderTimeline(eventCount = 7) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  apiFetch.mockImplementation(async () => ({ ok: true, json: async () => ({ events: makeEvents(eventCount) }) }) as Response);
  return render(createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(OrderActivityTimeline, { endpoint: "/api/orders/order-1/activity" }),
  ));
}

beforeEach(() => {
  apiFetch.mockClear();
});

describe("OrderActivityTimeline compact list", () => {
  it("shows five recent rows with a toggle for the rest", async () => {
    renderTimeline(7);
    const list = await screen.findByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    const toggle = await screen.findByRole("button", { name: /view all 7/i });
    fireEvent.click(toggle);
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    fireEvent.click(screen.getByRole("button", { name: /show recent/i }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
  });

  it("expands a row on click to show the status transition", async () => {
    renderTimeline(2);
    const list = await screen.findByRole("list");
    const rows = within(list).getAllByRole("listitem");
    expect(within(rows[0]).queryByText(/confirmed/)).not.toBeInTheDocument();
    fireEvent.click(within(rows[0]).getByRole("button", { name: /cancelled/i }));
    expect(await within(rows[0]).findByText(/confirmed/)).toBeInTheDocument();
    fireEvent.click(within(rows[0]).getByRole("button", { name: /cancelled/i }));
    expect(within(rows[0]).queryByText(/confirmed/)).not.toBeInTheDocument();
  });
});
