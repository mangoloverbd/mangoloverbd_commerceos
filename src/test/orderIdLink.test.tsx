import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { OrderIdLink } from "@/components/orders/OrderIdLink";

describe("OrderIdLink", () => {
  it("links the displayed order number to its editor in a new tab", () => {
    render(
      <MemoryRouter>
        <OrderIdLink orderId="order-1" orderNumber="ML-1001" />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "Open order ML-1001 in a new tab" });
    expect(link).toHaveAttribute("href", "/orders/order-1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not trigger a surrounding row click", async () => {
    const user = userEvent.setup();
    const onParentClick = vi.fn();
    render(
      <MemoryRouter>
        <div onClick={onParentClick}>
          <OrderIdLink orderId="order-1" orderNumber="#ML-1001" />
        </div>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("link", { name: "Open order ML-1001 in a new tab" }));

    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("encodes the pending context in the href when provided", () => {
    render(
      <MemoryRouter>
        <OrderIdLink orderId="order-1" orderNumber="ML-1001" search="?fulfillmentTab=pending" />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "Open order ML-1001 in a new tab" });
    expect(link).toHaveAttribute("href", "/orders/order-1?fulfillmentTab=pending");
  });
});
