import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerPanel } from "@/components/order-editor/CustomerPanel";

const baseOrder = {
  id: "order-1",
  order_number: "ML-1001",
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

function renderPanel(orderStatus: string | null = "confirmed", phone = baseCustomer.phone) {
  const onApply = vi.fn();
  render(
    <CustomerPanel
      order={{ ...baseOrder, status: orderStatus }}
      customer={{ ...baseCustomer, phone }}
      onApply={onApply}
    />,
  );
  return { onApply };
}

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

describe("CustomerPanel messaging actions", () => {
  it("shows individual SMS and WhatsApp actions for a valid saved phone", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByRole("link", { name: /open whatsapp chat/i })).toHaveAttribute(
      "href",
      "https://wa.me/8801711111111",
    );
    await user.click(screen.getByRole("button", { name: /send sms/i }));
    expect(await screen.findByRole("heading", { name: /send individual sms/i })).toBeInTheDocument();
    expect(screen.getByText(/Order #ML-1001/)).toBeInTheDocument();
  });

  it("does not offer messaging actions for an invalid saved phone", () => {
    renderPanel("confirmed", "not-a-phone");

    expect(screen.queryByRole("button", { name: /send sms/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open whatsapp chat/i })).not.toBeInTheDocument();
  });
});
