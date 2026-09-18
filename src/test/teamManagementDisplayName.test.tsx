import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "admin-1", email: "admin@example.com" } }),
}));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true }),
}));

import { apiFetch } from "@/lib/api";
import { TeamManagement } from "@/components/TeamManagement";

const members = [
  {
    id: "r1",
    user_id: "u1",
    role: "team_member",
    email: "rakib@example.com",
    display_name: null,
  },
];

describe("TeamManagement display names", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ members }),
    } as Response);
  });

  it("shows the email as the fallback identifier when a member has no name", async () => {
    render(<TeamManagement />);

    expect(await screen.findByLabelText("Name for rakib@example.com")).toHaveValue("");
    expect(screen.getByText("rakib@example.com")).toBeInTheDocument();
  });

  it("saves a name on blur through the admin rename endpoint", async () => {
    const user = userEvent.setup();
    render(<TeamManagement />);
    const input = await screen.findByLabelText("Name for rakib@example.com");

    await user.type(input, "Rakib");
    await user.tab();

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/team-members/r1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ display_name: "Rakib" }),
        }),
      );
    });
  });
});
