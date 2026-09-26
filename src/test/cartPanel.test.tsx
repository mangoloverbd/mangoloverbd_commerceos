import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CartPanel } from "@/components/order-editor/CartPanel";

const totals = {
  quantity: 0,
  grossSubtotal: 0,
  itemDiscount: 0,
  legacyDiscount: 0,
  aggregateDiscount: 0,
  netMerchandiseTotal: 0,
  deliveryFee: 80,
  finalTotal: 80,
};

function renderCart(status: string, options: { cancellationRequired?: boolean } = {}) {
  const onStatusChange = vi.fn();
  const onHoldDetailsChange = vi.fn();
  const onCancellationReasonChange = vi.fn();
  function Harness() {
    const [holdDetails, setHoldDetails] = useState({ hold_reason_code: null, hold_reason_detail: null, hold_until_date: null });
    return (
      <CartPanel
        items={[]}
        totals={totals}
        canEdit
        locked={false}
        saving={false}
        status={status}
        onStatusChange={onStatusChange}
        holdDetails={holdDetails}
        onHoldDetailsChange={(next) => { onHoldDetailsChange(next); setHoldDetails(next); }}
        cancellationRequired={options.cancellationRequired}
        cancellationReasonCode=""
        onCancellationReasonChange={onCancellationReasonChange}
        overallDiscountType={null}
        overallDiscountValue={0}
        deliveryOn
        advance={0}
        onAdvanceChange={vi.fn()}
        onToggleDelivery={vi.fn()}
        onOverallDiscount={vi.fn()}
        onRemoveOverallDiscount={vi.fn()}
        onQuantity={vi.fn()}
        onRemove={vi.fn()}
        onDiscount={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );
  }
  render(<Harness />);
  return { onStatusChange, onHoldDetailsChange, onCancellationReasonChange };
}

describe("CartPanel order status", () => {
  it("uses the BoardUI ghost button for the main Cancel action", () => {
    renderCart("confirmed");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("bg-button-ghost-background");
  });

  it("offers print for an approved order and stages the selection", async () => {
    const user = userEvent.setup();
    const { onStatusChange } = renderCart("confirmed");

    await user.click(screen.getByRole("button", { name: /order status/i }));
    await user.click(await screen.findByRole("option", { name: "print" }));

    expect(onStatusChange).toHaveBeenCalledWith("print");
  });

  it("hides print for a pending order", async () => {
    const user = userEvent.setup();
    renderCart("pending");

    await user.click(screen.getByRole("button", { name: /order status/i }));

    expect(screen.queryByRole("option", { name: "print" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Approved" })).toBeInTheDocument();
  });

  it("offers approved and cancelled for a print order", async () => {
    const user = userEvent.setup();
    const { onStatusChange } = renderCart("print");

    await user.click(screen.getByRole("button", { name: /order status/i }));

    expect(screen.getByRole("option", { name: "Approved" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "cancelled" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Approved" }));
    expect(onStatusChange).toHaveBeenCalledWith("confirmed");
  });

  it("shows Bengali hold reasons instead of reusing the general Notes field", async () => {
    const user = userEvent.setup();
    const { onHoldDetailsChange } = renderCart("on_hold");

    const reason = screen.getByRole("button", { name: /Hold reason/ });
    await user.click(reason);
    expect(await screen.findByRole("option", { name: "অগ্রিম পেমেন্টের জন্য অর্ডার হোল্ডে রাখা হয়েছে" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "অগ্রিম পেমেন্টের জন্য অর্ডার হোল্ডে রাখা হয়েছে" }));

    expect(onHoldDetailsChange).toHaveBeenLastCalledWith({
      hold_reason_code: "advance_payment_pending",
      hold_reason_detail: null,
      hold_until_date: null,
    });
  });

  it("opens the cancellation reason menu upward with Bengali choices in the order editor", async () => {
    const user = userEvent.setup();
    const { onCancellationReasonChange } = renderCart("confirmed", { cancellationRequired: true });

    await user.click(screen.getByRole("button", { name: /Cancellation reason/ }));

    const listbox = await screen.findByRole("listbox");
    expect(listbox.closest("[data-placement]")).toHaveAttribute("data-placement", "top");
    expect(screen.getByRole("button", { name: /কারণ নির্বাচন করুন/ })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "এলাকা পরিবর্তন" }));
    expect(onCancellationReasonChange).toHaveBeenCalledWith("zone_change");
  });
});

describe("CartPanel draft mode", () => {
  it("hides status, notes, and discount editors when hideOrderSections is set", () => {
    render(
      <CartPanel
        items={[]}
        totals={totals}
        canEdit
        locked={false}
        saving={false}
        status={null}
        onStatusChange={vi.fn()}
        overallDiscountType={null}
        overallDiscountValue={0}
        deliveryOn
        advance={0}
        onAdvanceChange={vi.fn()}
        onToggleDelivery={vi.fn()}
        onOverallDiscount={vi.fn()}
        onRemoveOverallDiscount={vi.fn()}
        onQuantity={vi.fn()}
        onRemove={vi.fn()}
        onDiscount={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        hideOrderSections
      />,
    );

    expect(screen.queryByRole("button", { name: /order status/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hold reason/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cart discount/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });

  it("hides hold note and per-line discount editors in draft mode for an on-hold cart", () => {
    render(
      <CartPanel
        items={[{ id: "line-1", product_id: "p-1", variant_id: null, product_name: "Langra Mango", variant_name: null, unit_price: 500, discount_type: null, discount_value: 0, unit_discount: 0, quantity: 1 }]}
        totals={totals}
        canEdit
        locked={false}
        saving={false}
        status="on_hold"
        onStatusChange={vi.fn()}
        overallDiscountType={null}
        overallDiscountValue={0}
        deliveryOn
        advance={0}
        onAdvanceChange={vi.fn()}
        onToggleDelivery={vi.fn()}
        onOverallDiscount={vi.fn()}
        onRemoveOverallDiscount={vi.fn()}
        onQuantity={vi.fn()}
        onRemove={vi.fn()}
        onDiscount={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        hideOrderSections
      />,
    );

    expect(screen.queryByRole("button", { name: /order status/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hold reason/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /discount to langra mango/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cart discount/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });

  it("keeps status and notes visible by default", () => {
    renderCart("confirmed");
    expect(screen.getByRole("button", { name: /order status/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hold reason/ })).not.toBeInTheDocument();
  });
});
