import { MemoryRouter } from "react-router-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true, role: "admin" }) }));
vi.mock("@/hooks/useOrgName", () => ({ useOrgName: () => ({ orgName: "Mango Lover BD", isLoading: false }) }));
vi.mock("@/hooks/useNavCounts", () => ({ useNavCounts: () => ({ data: { order_protection_held: 0, returns_pending: 0 } }) }));

describe("sidebar workspace card", () => {
  it("shows the role above the shop name in a card that opens settings", () => {
    render(
      <MemoryRouter>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>,
    );

    const card = screen.getByTestId("sidebar-workspace-card");
    expect(card).toHaveAttribute("href", "/settings");
    expect(card).toHaveAttribute("title", "System Settings");
    const role = within(card).getByText("Admin");
    const name = within(card).getByText("Mango Lover BD");
    expect(role.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(card).getByTestId("sidebar-workspace-logo")).toHaveClass("bg-white");
  });
});

describe("sidebar brand header", () => {
  function renderSidebar() {
    return render(
      <MemoryRouter>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>,
    );
  }

  it("shows the logo tile, shop name, and product line", () => {
    renderSidebar();
    const brand = screen.getByTestId("sidebar-brand");
    expect(within(brand).getByTestId("sidebar-brand-logo")).toHaveClass("bg-white");
    const name = within(brand).getByText("Mango Lover BD");
    const product = within(brand).getByText("Merchant Suite");
    expect(name.compareDocumentPosition(product) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(brand).queryByText("merchant-suite")).not.toBeInTheDocument();
  });

  it("collapses with the arrow and expands from the logo tile", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.queryByRole("button", { name: "Collapse sidebar" })).not.toBeInTheDocument();
    expect(within(screen.getByTestId("sidebar-brand")).queryByText("Mango Lover BD")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });
});
