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

function renderCart(status: string, notes = "") {
  const onStatusChange = vi.fn();
  const onNotesChange = vi.fn();
  function Harness() {
    const [draftNotes, setDraftNotes] = useState(notes);
    return (
      <CartPanel
        items={[]}
        totals={totals}
        canEdit
        locked={false}
        saving={false}
        status={status}
        onStatusChange={onStatusChange}
        notes={draftNotes}
        onNotesChange={(next) => { onNotesChange(next); setDraftNotes(next); }}
        overallDiscountType={null}
        overallDiscountValue={0}
        deliveryOn
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
  return { onStatusChange, onNotesChange };
}

describe("CartPanel order status", () => {
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

  it("shows a compact hold note below the status control", async () => {
    const user = userEvent.setup();
    const { onNotesChange } = renderCart("on_hold", "Existing note");

    const note = screen.getByRole("textbox", { name: "Hold note" });
    expect(note).toHaveValue("Existing note");
    await user.clear(note);
    await user.type(note, "Waiting for stock");

    expect(onNotesChange).toHaveBeenLastCalledWith("Waiting for stock");
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
        notes=""
        onNotesChange={vi.fn()}
        overallDiscountType={null}
        overallDiscountValue={0}
        deliveryOn
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
    expect(screen.queryByRole("textbox", { name: "Hold note" })).not.toBeInTheDocument();
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
        notes="Existing note"
        onNotesChange={vi.fn()}
        overallDiscountType={null}
        overallDiscountValue={0}
        deliveryOn
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
    expect(screen.queryByRole("textbox", { name: "Hold note" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /discount to langra mango/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cart discount/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });

  it("keeps status and notes visible by default", () => {
    renderCart("confirmed");
    expect(screen.getByRole("button", { name: /order status/i })).toBeInTheDocument();
  });
});
