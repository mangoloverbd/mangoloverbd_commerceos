import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardNavigation, { type NavSection } from "@/components/nav-main";

const icon = <svg aria-hidden="true" />;

function sections(badges: { returns?: number; protection?: number } = {}): NavSection[] {
  return [
    {
      label: "",
      routes: [
        { id: "home", title: "Home", icon, link: "/" },
        { id: "returns", title: "Returns", icon, link: "/returns", badge: badges.returns },
        { id: "order-protection", title: "Order Protection", icon, link: "/order-protection", badge: badges.protection },
      ],
    },
    {
      label: "Reports",
      collapsible: true,
      routes: [
        { id: "staff", title: "Staff", icon, link: "/reports/staff" },
        { id: "activity", title: "Activity Log", icon, link: "/reports/activity" },
      ],
    },
  ];
}

function renderNav(navSections: NavSection[], { path = "/", open = true } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarProvider defaultOpen={open}>
        <DashboardNavigation sections={navSections} />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("sidebar badges", () => {
  beforeEach(() => localStorage.clear());

  it("shows counts beside Returns and Order Protection and hides zero", () => {
    renderNav(sections({ returns: 3, protection: 0 }));
    const returns = screen.getByRole("link", { name: /Returns/ });
    expect(within(returns).getByTestId("nav-badge")).toHaveTextContent("3");
    expect(within(returns).getByTestId("nav-badge")).toHaveClass("bg-status-yellow-background");
    const protection = screen.getByRole("link", { name: /Order Protection/ });
    expect(within(protection).queryByTestId("nav-badge")).not.toBeInTheDocument();
  });

  it("caps large counts at 99+", () => {
    renderNav(sections({ protection: 140 }));
    expect(within(screen.getByRole("link", { name: /Order Protection/ })).getByTestId("nav-badge")).toHaveTextContent("99+");
  });

  it("shows a dot on the icon when the sidebar is collapsed", () => {
    renderNav(sections({ returns: 2 }), { open: false });
    const returns = screen.getByRole("link", { name: /Returns/ });
    expect(within(returns).getByTestId("nav-badge-dot")).toBeInTheDocument();
    expect(within(returns).getByText("2 pending")).toHaveClass("sr-only");
  });
});

describe("collapsible sidebar groups", () => {
  beforeEach(() => localStorage.clear());

  it("folds a group and remembers the choice", async () => {
    const user = userEvent.setup();
    const { unmount } = renderNav(sections());
    const toggle = screen.getByRole("button", { name: "Reports" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /Staff/ })).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // The group clips shut with an exit animation before it unmounts.
    await waitFor(() => expect(screen.queryByRole("link", { name: /Staff/ })).not.toBeInTheDocument());
    unmount();

    renderNav(sections());
    expect(screen.getByRole("button", { name: "Reports" })).toHaveAttribute("aria-expanded", "false");
  });

  it("opens a folded group when one of its pages is active", () => {
    localStorage.setItem("ml:sidebar-group:Reports", "closed");
    renderNav(sections(), { path: "/reports/activity" });
    expect(screen.getByRole("button", { name: "Reports" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /Activity Log/ })).toBeInTheDocument();
  });

  it("marks the active page with a side bar", () => {
    renderNav(sections(), { path: "/returns" });
    expect(within(screen.getByRole("link", { name: /Returns/ })).getByTestId("nav-active-bar")).toBeInTheDocument();
  });
});

describe("active item card", () => {
  it("renders exactly one sliding card, inside the active link", () => {
    renderNav(sections(), { path: "/returns" });
    const pills = screen.getAllByTestId("nav-active-pill");
    expect(pills).toHaveLength(1);
    expect(within(screen.getByRole("link", { name: /Returns/ })).getByTestId("nav-active-pill")).toBeInTheDocument();
  });
});

describe("hover card", () => {
  beforeEach(() => localStorage.clear());

  it("fades the hover background in on the hovered item and out of the previous one", async () => {
    renderNav(sections(), { path: "/returns" });
    const home = screen.getByRole("link", { name: /Home/ });
    const staff = screen.getByRole("link", { name: /Staff/ });

    fireEvent.mouseEnter(home);
    expect(within(home).getByTestId("nav-hover-pill")).toBeInTheDocument();

    fireEvent.mouseEnter(staff);
    expect(within(staff).getByTestId("nav-hover-pill")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId("nav-hover-pill")).toHaveLength(1));
  });

  it("never draws the hover card on the active item and clears when the pointer leaves the menu", async () => {
    renderNav(sections(), { path: "/returns" });
    const returns = screen.getByRole("link", { name: /Returns/ });
    fireEvent.mouseEnter(returns);
    expect(within(returns).queryByTestId("nav-hover-pill")).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole("link", { name: /Home/ }));
    fireEvent.mouseLeave(screen.getByTestId("sidebar-nav"));
    await waitFor(() => expect(screen.queryByTestId("nav-hover-pill")).not.toBeInTheDocument());
  });
});
