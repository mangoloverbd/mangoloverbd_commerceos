import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OrdersTable, type Order } from "@/components/OrdersTable";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/useOrgName", () => ({ useOrgName: () => ({ orgName: "Mango Lover BD" }) }));
vi.mock("@/hooks/useWarehouses", () => ({ useWarehouses: () => ({ warehouses: [] }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/ui/sonner", () => ({
  toast: { custom: vi.fn(), error: vi.fn(), success: vi.fn() },
  DarkToast: () => null,
}));

const orders: Order[] = Array.from({ length: 50 }, (_, index) => ({
  id: `order-${index + 1}`,
  shopify_order_id: index + 1,
  order_number: `#${index + 1}`,
  customer_name: `Customer ${index + 1}`,
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
}));

function renderedRowIds(revealOrderId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <OrdersTable orders={orders} loading={false} onStatusUpdate={vi.fn()} revealOrderId={revealOrderId} />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return [...container.querySelectorAll("[data-order-row]")].map((row) => row.getAttribute("data-order-row"));
}

describe("OrdersTable revealOrderId", () => {
  it("renders the first 20 rows by default", () => {
    expect(renderedRowIds()).toHaveLength(20);
  });

  it("renders through the revealed order plus 12 more in the first paint", () => {
    const ids = renderedRowIds("order-31");
    expect(ids).toHaveLength(43);
    expect(ids).toContain("order-31");
  });

  it("falls back to 20 rows when the order is not in the list", () => {
    expect(renderedRowIds("missing")).toHaveLength(20);
  });
});
