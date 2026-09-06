import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerPanel } from "@/components/order-editor/CustomerPanel";

const baseOrder = {
  status: "confirmed",
  payment_method: "Cash on delivery",
  delivery_rate: 80,
  price: 580,
  courier_name: null,
  courier_status: null,
  consignment_id: null,
  fraud_data: null,
  created_at: "2026-09-03T09:00:00Z",
  updated_at: "2026-09-03T10:00:00Z",
};

const baseCustomer = {
  customerName: "Ayesha Rahman",
  phone: "01711111111",
  address: "Dhanmondi, Dhaka",
};

function renderPanel(orderStatus: string | null = "confirmed") {
  const onApply = vi.fn();
  const onStatusChange = vi.fn();
  const onSaveNotes = vi.fn();
  render(
    <CustomerPanel
      order={{ ...baseOrder, status: orderStatus }}
      customer={baseCustomer}
      notes={null}
      onApply={onApply}
      onStatusChange={onStatusChange}
      onSaveNotes={onSaveNotes}
    />,
  );
  return { onStatusChange, onSaveNotes };
}

describe("CustomerPanel order status", () => {
  it("offers print for an approved order and reports the selection", async () => {
    const user = userEvent.setup();
    const { onStatusChange } = renderPanel("confirmed");

    await user.click(screen.getByRole("button", { name: /order status/i }));
    await user.click(await screen.findByRole("option", { name: "print" }));

    expect(onStatusChange).toHaveBeenCalledWith("print");
  });

  it("hides print for a pending order", async () => {
    const user = userEvent.setup();
    renderPanel("pending");

    await user.click(screen.getByRole("button", { name: /order status/i }));

    expect(screen.queryByRole("option", { name: "print" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Approved" })).toBeInTheDocument();
  });

  it("offers approved and cancelled for a print order", async () => {
    const user = userEvent.setup();
    const { onStatusChange } = renderPanel("print");

    await user.click(screen.getByRole("button", { name: /order status/i }));

    expect(screen.getByRole("option", { name: "Approved" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "cancelled" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Approved" }));
    expect(onStatusChange).toHaveBeenCalledWith("confirmed");
  });
});

describe("CustomerPanel hold note", () => {
  it("shows a note box prefilled with the existing note for on-hold orders", async () => {
    const user = userEvent.setup();
    const onSaveNotes = vi.fn();
    render(
      <CustomerPanel
        order={{ ...baseOrder, status: "on_hold" }}
        customer={baseCustomer}
        notes="Call before delivery"
        onApply={vi.fn()}
        onStatusChange={vi.fn()}
        onSaveNotes={onSaveNotes}
      />,
    );

    const box = screen.getByRole("textbox", { name: /hold note/i });
    expect(box).toHaveValue("Call before delivery");
    const save = screen.getByRole("button", { name: "Save note" });
    expect(save).toBeDisabled();

    await user.clear(box);
    await user.type(box, "Call before delivery, morning only");
    expect(save).not.toBeDisabled();
    await user.click(save);
    expect(onSaveNotes).toHaveBeenCalledWith("Call before delivery, morning only");
  });

  it("hides the note box for other statuses", () => {
    renderPanel("confirmed");
    expect(screen.queryByRole("textbox", { name: /hold note/i })).not.toBeInTheDocument();
  });
});

describe("CustomerPanel phone copy", () => {
  const writeText = vi.fn();

  function mockClipboard() {
    // userEvent.setup() installs its own navigator.clipboard stub, so the
    // mock must be applied after setup within each test.
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  }

  it("copies the phone number and confirms", async () => {
    const user = userEvent.setup();
    mockClipboard();
    renderPanel();

    await user.click(screen.getByRole("button", { name: /copy phone number/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("01711111111"));
    expect(await screen.findByRole("button", { name: /phone number copied/i })).toBeInTheDocument();
  });
});
