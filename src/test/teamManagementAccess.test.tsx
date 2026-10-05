import { render, screen, waitFor, within } from "@testing-library/react";
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
  { id: "r0", user_id: "admin-1", role: "admin", email: "admin@example.com", display_name: "Owner" },
  { id: "r1", user_id: "u1", role: "team_member", email: "rakib@example.com", display_name: "Rakib", post: "Packer", suspended_at: null },
];

function ok(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

describe("TeamManagement access controls", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation(async (_url, init) => {
      if (!init?.method) return ok({ members });
      if (init.method === "POST") return ok({ email: "nadia@example.com", password: "Temp-pass-123" });
      if (init.method === "PATCH") return ok({ member: { id: "r1", suspended_at: "2026-10-05T00:00:00Z" } });
      return ok({ success: true });
    });
  });

  it("switches a member off through the update endpoint", async () => {
    const user = userEvent.setup();
    render(<TeamManagement />);

    await user.click(await screen.findByTestId("switch-member-active-r1"));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/team-members/r1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ active: false }) }),
      );
    });
    expect(screen.queryByTestId("switch-member-active-r0")).not.toBeInTheDocument();
  });

  it("asks for confirmation before removing and does nothing on cancel", async () => {
    const user = userEvent.setup();
    render(<TeamManagement />);

    await user.click(await screen.findByTestId("button-remove-member-r1"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Remove Rakib?");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(apiFetch).not.toHaveBeenCalledWith("/api/team-members/r1", expect.objectContaining({ method: "DELETE" }));
  });

  it("removes the member after confirming", async () => {
    const user = userEvent.setup();
    render(<TeamManagement />);

    await user.click(await screen.findByTestId("button-remove-member-r1"));
    await user.click(screen.getByTestId("button-confirm-remove-member"));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/team-members/r1", expect.objectContaining({ method: "DELETE" }));
    });
  });

  it("sets a member's post from the picker", async () => {
    const user = userEvent.setup();
    render(<TeamManagement />);

    await user.click(await screen.findByRole("button", { name: "Post for Rakib" }));
    const picker = await screen.findByRole("dialog");
    await user.click(within(picker).getByRole("button", { name: "Moderator" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/team-members/r1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ post: "Moderator" }) }),
      );
    });
  });

  it("adds a member from the dialog and shows their login details", async () => {
    const user = userEvent.setup();
    render(<TeamManagement />);

    await user.click(await screen.findByTestId("button-open-add-member"));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText("e.g. Rakib Hasan"), "Nadia");
    await user.type(within(dialog).getByPlaceholderText("name@company.com"), "nadia@example.com");
    await user.click(within(dialog).getByTestId("button-add-member-continue"));
    await user.click(await within(dialog).findByRole("button", { name: /^Moderator/ }));
    await user.click(within(dialog).getByTestId("button-create-member"));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/team-members",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "nadia@example.com", display_name: "Nadia", post: "Moderator" }),
        }),
      );
    });
    expect(await screen.findByText("Nadia is in")).toBeInTheDocument();
  });
});
