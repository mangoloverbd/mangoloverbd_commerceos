import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MobileOrderCards } from "@/components/MobileOrderCards";
import type { Order } from "@/components/OrdersTable";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    shopify_order_id: 1000,
    order_number: "ML-1000",
    customer_name: "Test Customer",
    phone: "01700000000",
    address: "Dhaka",
    product: "Mango · ×1",
    quantity: 1,
    price: 850,
    status: "pending",
    created_at: "2026-09-11T08:00:00.000Z",
    fraud_checked: false,
    fraud_data: null,
    delivery_rate: 100,
    ...overrides,
  };
}

describe("MobileOrderCards", () => {
  it("renders the mobile order summary and opens the order", async () => {
    const user = userEvent.setup();
    const order = makeOrder({ order_number: "ML-1001", customer_name: "Mango Buyer", price: 1250, status: "confirmed" });
    const onOpenOrder = vi.fn();

    render(
      <MobileOrderCards
        orders={[order]}
        loading={false}
        selectedIds={new Set()}
        onToggleSelection={vi.fn()}
        onToggleSelectAll={vi.fn()}
        onOpenOrder={onOpenOrder}
        renderActions={() => null}
      />,
    );

    expect(screen.getByText("#ML-1001")).toBeInTheDocument();
    expect(screen.getByText("Mango Buyer")).toBeInTheDocument();
    expect(screen.getByText(/৳1,250/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open order #ML-1001/i }));
    expect(onOpenOrder).toHaveBeenCalledWith(order.id);
  });

  it("keeps selection separate from opening the order", async () => {
    const user = userEvent.setup();
    const onToggleSelection = vi.fn();
    const order = makeOrder();

    render(
      <MobileOrderCards
        orders={[order]}
        loading={false}
        selectedIds={new Set()}
        onToggleSelection={onToggleSelection}
        onToggleSelectAll={vi.fn()}
        onOpenOrder={vi.fn()}
        renderActions={() => null}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /select order/i }));
    expect(onToggleSelection).toHaveBeenCalledWith(order.id);
  });
});
