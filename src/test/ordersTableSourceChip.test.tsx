import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OrdersTable, type Order } from "@/components/OrdersTable";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/useOrgName", () => ({ useOrgName: () => ({ orgName: "Mango Lover BD" }) }));
vi.mock("@/hooks/useWarehouses", () => ({ useWarehouses: () => ({ warehouses: [] }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/ui/sonner", () => ({
  toast: { custom: vi.fn(), error: vi.fn(), success: vi.fn() },
  DarkToast: () => null,
}));

const order: Order = {
  id: "order-1",
  shopify_order_id: 101,
  order_number: "#101",
  customer_name: "Test Customer",
  phone: "01700000001",
  address: "Dhaka",
  product: "Mango",
  quantity: 1,
  price: 800,
  status: "pending",
  created_at: "2026-09-25T10:00:00.000Z",
  fraud_checked: false,
  fraud_data: null,
  delivery_rate: 60,
};

function renderRow(row: Order) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <OrdersTable orders={[row]} loading={false} onStatusUpdate={vi.fn()} />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return screen.getByRole("row", { name: /Open order #101/ });
}

describe("OrdersTable order source chip", () => {
  it("shows the order source as a yellow chip under the customer's phone", () => {
    const row = renderRow({ ...order, source: "facebook" });
    const chip = within(row).getByTestId("order-source-chip");
    expect(chip).toHaveTextContent("Facebook");
    expect(chip).toHaveClass("bg-status-yellow-background", "rounded-[4px]");
  });

  it("labels storefront orders as Website", () => {
    const row = renderRow({ ...order, source: "storefront" });
    expect(within(row).getByTestId("order-source-chip")).toHaveTextContent("Website");
  });

  it("hides the chip when the order has no recorded source", () => {
    const row = renderRow({ ...order, source: null });
    expect(within(row).queryByTestId("order-source-chip")).not.toBeInTheDocument();
  });
});
