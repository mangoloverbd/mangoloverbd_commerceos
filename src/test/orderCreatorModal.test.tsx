import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import NewOrder from "@/pages/NewOrder";

const apiFetch = vi.hoisted(() => vi.fn());
const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/components/ui/sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), custom: vi.fn() },
  DarkToast: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "operator@example.com" } }),
}));

describe("NewOrder", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ products: [] }) });
    consoleWarn.mockClear();
  });

  afterAll(() => {
    consoleWarn.mockRestore();
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
    expect(screen.getByLabelText("Order source")).toHaveTextContent("Manual / Other");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/products"));
    expect(screen.getByLabelText("Telesales staff")).toBeInTheDocument();
    expect(consoleWarn).not.toHaveBeenCalledWith(
      expect.stringContaining("A component changed from uncontrolled to controlled"),
    );
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/products"));
  });

  it("checks fraud in the background once a valid phone is entered", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/orders/new"]}>
          <NewOrder />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.type(screen.getByRole("textbox", { name: "Phone" }), "01712345678");

    await waitFor(() => {
      const call = apiFetch.mock.calls.find(([requestUrl, requestInit]) => requestUrl === "/api/fraud/check" && requestInit?.method === "POST");
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ phone: "01712345678" });
    });
  });

  it("submits the selected order source and staff assignee", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/products") {
        return { ok: true, json: async () => ({ products: [{ id: "honey", name: "Sundarbans Honey", selling_price: 850, variants: [], images: [] }] }) };
      }
      if (url === "/api/staff") {
        return { ok: true, json: async () => ({ staff: [{ user_id: "user-1", display_name: "Operator" }, { user_id: "user-2", display_name: "Nadia" }] }) };
      }
      if (url === "/api/orders" && init?.method === "POST") {
        return { ok: true, json: async () => ({ order: { id: "order-1" } }) };
      }
      throw new Error(`Unexpected API request: ${url}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/orders/new"]}>
          <NewOrder />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByLabelText("Order source"));
    await user.click(await screen.findByRole("option", { name: "Phone" }));
    await user.click(screen.getByLabelText("Telesales staff"));
    await user.click(await screen.findByRole("option", { name: "Nadia" }));
    await user.type(screen.getByRole("textbox", { name: "Customer name" }), "Rahim Uddin");
    await user.type(screen.getByRole("textbox", { name: "Phone" }), "01712345678");
    await user.type(screen.getByRole("textbox", { name: "Delivery address" }), "Dhanmondi, Dhaka");
    await user.click(await screen.findByRole("button", { name: "Add Sundarbans Honey to cart" }));
    await user.click(screen.getByRole("button", { name: /create order/i }));

    await waitFor(() => {
      const call = apiFetch.mock.calls.find(([requestUrl, requestInit]) => requestUrl === "/api/orders" && requestInit?.method === "POST");
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ source: "phone", assigned_to: "user-2", status: "confirmed" });
    });
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

  it("classifies a created manual order into the approved filter", async () => {
    const { classifyOrderStatus, filterOrdersByStatus } = await import("@/lib/orderStatusFilters");
    const created = { id: "order-1", status: "confirmed" };

    expect(classifyOrderStatus(created)).toBe("approved");
    expect(filterOrdersByStatus([created], "approved")).toHaveLength(1);
    expect(filterOrdersByStatus([created], "pending")).toHaveLength(0);
  });
});
