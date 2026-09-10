import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";

function renderNavigation(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SidebarProvider>
        <MobileBottomNav />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("MobileBottomNav", () => {
  it("exposes the five mobile destinations with accessible labels", () => {
    renderNavigation();

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/overview");
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("href", "/inbox/facebook");
    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("href", "/products");
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("marks the current destination", () => {
    renderNavigation("/products");

    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
  });
});
