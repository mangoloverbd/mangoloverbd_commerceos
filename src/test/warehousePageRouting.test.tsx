import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Warehouses from "@/pages/Warehouses";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/components/ui/sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const warehouses = [
  { id: "main", name: "Main Warehouse", address: "Dhanmondi", contact_person: "Nadia", phone: "01700000001", is_default: true, product_count: 12 },
  { id: "north", name: "North Hub", address: "Uttara", contact_person: "Rafi", phone: "01700000002", is_default: false, product_count: 5 },
  { id: "south", name: "South Depot", address: null, contact_person: null, phone: null, is_default: false, product_count: 0 },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/warehouses"]}>
        <Routes>
          <Route path="/warehouses" element={<Warehouses />} />
          <Route path="/warehouses/:id" element={<div>Warehouse detail destination</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("warehouse directory", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ warehouses }) });
  });

  it("shows inventory metrics and filters across warehouse metadata", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: "Warehouses" })).toBeInTheDocument();
    expect(await screen.findByText("Warehouse Queue")).toBeInTheDocument();
    expect(await screen.findByText("North Hub")).toBeInTheDocument();
    expect(screen.getByText("Assigned").closest("div")).toHaveTextContent("17");
    expect(screen.getAllByText("Main Warehouse", { selector: "p" })).toHaveLength(2);

    await user.type(screen.getByTestId("input-search-warehouses"), "uttara");
    expect(screen.getByText("North Hub")).toBeInTheDocument();
    expect(screen.queryByText("South Depot")).not.toBeInTheDocument();
  });

  it("opens the create dialog and protects the default warehouse from deletion", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("button", { name: "Delete Main Warehouse" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "New Warehouse" }));
    expect(screen.getByRole("dialog", { name: "New warehouse" })).toBeInTheDocument();
  });

  it("navigates from a non-interactive part of a warehouse row", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("row-warehouse-north"));
    expect(screen.getByText("Warehouse detail destination")).toBeInTheDocument();
  });
});
