import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewOrder from "@/pages/NewOrder";

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/components/ui/sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), custom: vi.fn() },
  DarkToast: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("NewOrder", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ products: [] }) });
  });

  it("renders the order editor workspace and persistent actions", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/orders/new"]}>
          <NewOrder />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("New order")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Product catalog" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Order cart" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create order/i })).toBeInTheDocument();
    expect(screen.getByText("Run fraud check")).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/products"));
  });

  it("adds a catalog product into the cart without opening a picker", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        products: [{ id: "honey", name: "Sundarbans Honey", selling_price: 850, stock_quantity: 6, variants: [], images: [] }],
      }),
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/orders/new"]}>
          <NewOrder />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const catalog = await screen.findByRole("region", { name: "Product catalog" });
    await user.click(await within(catalog).findByRole("button", { name: "Add Sundarbans Honey to cart" }));
    expect(within(screen.getByRole("region", { name: "Order cart" })).getByText("Sundarbans Honey")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /add a product/i })).not.toBeInTheDocument();
  });
});
