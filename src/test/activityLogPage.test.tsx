import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/components/DateRangePicker", () => ({
  DateRangePicker: ({ onChange }: { onChange: (range: { from: Date; to: Date } | null) => void }) => (
    <button type="button" onClick={() => onChange(null)}>All time</button>
  ),
}));

import { apiFetch } from "@/lib/api";
import type { ActivityLogResponse } from "@/lib/activityLogPresentation";
import ActivityLog from "@/pages/ActivityLog";

const RafiId = "11111111-1111-1111-1111-111111111111";

function baseResponse(overrides: Partial<ActivityLogResponse> = {}): ActivityLogResponse {
  return {
    range: { from: "2026-09-01", to: "2026-09-22" },
    available_staff: [{ user_id: RafiId, display_name: "Rafi", is_active: true }],
    selected_user_ids: [RafiId],
    events: [{
      id: "event-1",
      occurred_at: "2026-09-22T10:00:00.000Z",
      action: "confirmed",
      order_table: "orders",
      order_id: "order-1",
      order_label: "Order #1042",
      order_value: 500,
      actor_id: RafiId,
      actor_display_name: "Rafi",
    }],
    total: 1,
    action_counts: { confirmed: 1 },
    page: 0,
    page_size: 50,
    has_more: false,
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function renderPage(ui: ReactElement = <ActivityLog />) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ActivityLog table filter", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("does not blank the page back to a loading spinner when switching order-type tabs", async () => {
    let resolveSecondFetch!: (value: Response) => void;
    const secondFetch = new Promise<Response>((resolve) => { resolveSecondFetch = resolve; });

    vi.mocked(apiFetch)
      .mockResolvedValueOnce(jsonResponse(baseResponse()))
      .mockReturnValueOnce(secondFetch);

    const user = userEvent.setup();
    renderPage();

    await screen.findByText(/Order #1042/);
    expect(screen.queryByText("Loading activity log")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Orders" }));

    // The previous row must still be visible while the "orders"-filtered
    // request is in flight — the page must not revert to the full-screen
    // loading state that was only appropriate for the very first load.
    expect(screen.queryByText("Loading activity log")).not.toBeInTheDocument();
    expect(screen.getByText(/Order #1042/)).toBeInTheDocument();

    resolveSecondFetch(jsonResponse(baseResponse({
      events: [{
        id: "event-2",
        occurred_at: "2026-09-22T11:00:00.000Z",
        action: "cancelled",
        order_table: "orders",
        order_id: "order-2",
        order_label: "Order #1099",
        order_value: 300,
        actor_id: RafiId,
        actor_display_name: "Rafi",
      }],
      total: 1,
      action_counts: { cancelled: 1 },
    })));

    await waitFor(() => expect(screen.getByText(/Order #1099/)).toBeInTheDocument());
    expect(screen.queryByText(/Order #1042/)).not.toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(apiFetch).mock.calls[1][0]).toContain("table=orders");
  });
});
