import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AbandonedCheckoutEditDialog } from "@/components/orders/AbandonedCheckoutEditDialog";
import type { AbandonedCheckout } from "@/lib/abandonedCheckouts";

const checkout: AbandonedCheckout = {
  id: "7cb13b8e-b576-4faa-b238-cc8b73059772",
  status: "open",
  customer_name: "Farzana Akter",
  phone: "01712345678",
  address: "House 1, Road 2, Dhaka",
  cart: [{ productName: "Sundarbans Honey", variantName: "1 kg", quantity: 2, unitPrice: 750 }],
  subtotal: 1500,
  delivery_rate: 100,
  total: 1600,
  source: "sundarbans_honey",
  source_path: "/step/sundarbans-natural-honey",
  campaign: {},
  contacted_at: null,
  created_at: "2026-09-11T12:00:00.000Z",
  updated_at: "2026-09-11T12:00:00.000Z",
};

describe("AbandonedCheckoutEditDialog", () => {
  it("blocks save with an invalid phone and requires at least one line", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <AbandonedCheckoutEditDialog
        checkout={checkout}
        open
        saving={false}
        error={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const phoneField = screen.getByLabelText(/phone/i);
    await user.clear(phoneField);
    await user.type(phoneField, "123");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText(/valid Bangladeshi phone number/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("submits edited contact and cart values", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <AbandonedCheckoutEditDialog
        checkout={checkout}
        open
        saving={false}
        error={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.clear(screen.getByLabelText(/name/i));
    await user.type(screen.getByLabelText(/name/i), "Rahim Uddin");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      customerName: "Rahim Uddin",
      phone: "01712345678",
    }));
  });
});
