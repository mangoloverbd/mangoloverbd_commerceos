import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffSelect } from "@/components/order-editor/StaffSelect";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api";

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("StaffSelect", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("loads and lists staff from the member-safe roster endpoint", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        staff: [
          { user_id: "u1", display_name: "Rakib" },
          { user_id: "u2", display_name: "Nadia" },
        ],
      }),
    } as Response);
    const user = userEvent.setup();

    renderWithQuery(<StaffSelect value="u1" onChange={() => {}} />);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/staff");
    });
    await user.click(screen.getByLabelText("Telesales staff"));
    expect(await screen.findByRole("option", { name: "Rakib" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Nadia" })).toBeInTheDocument();
  });

  it("stays usable when the roster cannot load", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("network"));

    renderWithQuery(<StaffSelect value={null} onChange={() => {}} />);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/staff");
    });
    expect(screen.getByLabelText("Telesales staff")).not.toBeDisabled();
  });
});
