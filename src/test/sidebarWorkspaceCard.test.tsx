import { MemoryRouter } from "react-router-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

const role = vi.hoisted(() => ({ value: "admin" }));

vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: role.value === "admin", role: role.value }) }));
vi.mock("@/hooks/useOrgName", () => ({ useOrgName: () => ({ orgName: "Mango Lover BD", isLoading: false }) }));
vi.mock("@/hooks/useNavCounts", () => ({ useNavCounts: () => ({ data: { order_protection_held: 0, returns_pending: 0 } }) }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { email: "noor@example.com", user_metadata: { full_name: "Noor Karim" } }, signOut: vi.fn() }),
}));

function renderSidebar() {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("sidebar brand card", () => {
  it("shows the logo tile above-left of the product line and shop name", () => {
    renderSidebar();
    const brand = screen.getByTestId("sidebar-brand");
    expect(within(brand).getByTestId("sidebar-brand-logo")).toHaveClass("bg-white", "rounded-[6px]");
    expect(within(within(brand).getByTestId("sidebar-brand-logo")).getByRole("img", { name: "Mango Lover BD" })).toHaveAttribute("src", "/brand/mango-lover-logo.webp");
    const product = within(brand).getByText("Merchant Suite");
    const name = within(brand).getByText("Mango Lover BD");
    expect(product.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("puts the search bar directly below the brand card", () => {
    renderSidebar();
    const brand = screen.getByTestId("sidebar-brand");
    const search = screen.getByTestId("sidebar-search");
    expect(brand.nextElementSibling).toBe(search);
    expect(search).toHaveClass("rounded-[6px]");
    expect(within(search).getByText("⌘K")).toBeInTheDocument();
  });

  it("opens the page switcher from the search bar and from ⌘K", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByTestId("sidebar-search"));
    expect(await screen.findByPlaceholderText("Search pages…")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Customer List/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByPlaceholderText("Search pages…")).toBeInTheDocument();
  });
});

describe("sidebar footer", () => {
  it("shows the person's name and role on one line, then settings and minimise", () => {
    role.value = "admin";
    renderSidebar();
    const footer = screen.getByTestId("sidebar-footer");
    const profile = within(footer).getByTestId("sidebar-profile");
    expect(within(profile).getByText("Noor Karim")).toBeInTheDocument();
    expect(within(profile).getByText("· Admin")).toBeInTheDocument();
    expect(within(profile).getByText("NK")).toBeInTheDocument();
    const settings = within(footer).getByTestId("sidebar-settings");
    expect(settings).toHaveAttribute("href", "/settings");
    expect(settings).toHaveAttribute("title", "System Settings");
    const minimise = within(footer).getByRole("button", { name: "Collapse sidebar" });
    expect(profile.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(settings.compareDocumentPosition(minimise) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("labels team members as Team member", () => {
    role.value = "team_member";
    renderSidebar();
    expect(within(screen.getByTestId("sidebar-profile")).getByText("· Team member")).toBeInTheDocument();
    role.value = "admin";
  });

  it("collapses and expands with the bottom arrow, keeping one layout in both states", async () => {
    const user = userEvent.setup();
    const { container } = renderSidebar();
    const root = () => container.querySelector("[data-collapsible]");
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(root()).toHaveAttribute("data-state", "collapsed");
    // The shop name stays in place and fades with the rail instead of unmounting.
    expect(within(screen.getByTestId("sidebar-brand")).getByText("Mango Lover BD")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(root()).toHaveAttribute("data-state", "expanded");
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });
});
