import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AbandonedCheckoutQueue } from "@/components/orders/AbandonedCheckoutQueue";
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

const clipboardWriteText = vi.fn();

describe("AbandonedCheckoutQueue", () => {
  beforeEach(() => {
    clipboardWriteText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });
  });

  it("provides manual contact, copy, and contacted actions for a new checkout", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <AbandonedCheckoutQueue
        checkouts={[checkout]}
        loading={false}
        error={null}
        actionInFlightId={null}
        onAction={onAction}
      />,
    );

    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("Sundarbans Honey")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call 01712345678" })).toHaveAttribute("href", "tel:01712345678");
    expect(screen.getByRole("link", { name: "Open WhatsApp for 01712345678" })).toHaveAttribute("href", "https://wa.me/8801712345678");
    expect(screen.queryByRole("button", { name: /send.*message|courier|convert/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy checkout summary" }));
    expect(screen.getByText("Checkout summary copied")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark as contacted" }));
    expect(onAction).toHaveBeenCalledWith(checkout.id, "contacted");
  });

  it("requires confirmation before dismissing a checkout", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <AbandonedCheckoutQueue
        checkouts={[checkout]}
        loading={false}
        error={null}
        actionInFlightId={null}
        onAction={onAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Dismiss checkout" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Dismiss this checkout from the recovery queue?");
    expect(onAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirm dismiss" }));
    expect(onAction).toHaveBeenCalledWith(checkout.id, "dismissed");
  });

  it("uses dedicated loading, error, and empty states", () => {
    const { rerender } = render(
      <AbandonedCheckoutQueue
        checkouts={[]}
        loading
        error={null}
        actionInFlightId={null}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText("Loading abandoned checkouts…")).toBeInTheDocument();

    rerender(
      <AbandonedCheckoutQueue
        checkouts={[]}
        loading={false}
        error="Could not load abandoned checkouts"
        actionInFlightId={null}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText("Could not load abandoned checkouts")).toBeInTheDocument();

    rerender(
      <AbandonedCheckoutQueue
        checkouts={[]}
        loading={false}
        error={null}
        actionInFlightId={null}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText("No active abandoned checkouts")).toBeInTheDocument();
  });

  it("shows the phone number with per-field copy buttons", async () => {
    const user = userEvent.setup();
    // userEvent.setup() installs its own navigator.clipboard stub, so the
    // mock must be re-applied after setup within each test (see customerPanel.test.tsx).
    clipboardWriteText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });
    render(
      <AbandonedCheckoutQueue
        checkouts={[checkout]}
        loading={false}
        error={null}
        actionInFlightId={null}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText("01712345678")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy phone number" }));
    expect(clipboardWriteText).toHaveBeenCalledWith("01712345678");

    await user.click(screen.getByRole("button", { name: "Copy address" }));
    expect(clipboardWriteText).toHaveBeenCalledWith("House 1, Road 2, Dhaka");
  });

  it("renders quick actions without per-row edit or move-to buttons", () => {
    render(
      <AbandonedCheckoutQueue
        checkouts={[checkout]}
        loading={false}
        error={null}
        actionInFlightId={null}
        onAction={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Edit checkout" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /move to/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy checkout summary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as contacted" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss checkout" })).toBeInTheDocument();
  });

  it("supports selection and opens the detail page on row click", async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    const onSelectAll = vi.fn();
    const onOpenCheckout = vi.fn();
    render(
      <AbandonedCheckoutQueue
        checkouts={[checkout]}
        loading={false}
        error={null}
        actionInFlightId={null}
        onAction={vi.fn()}
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
        onSelectAll={onSelectAll}
        onOpenCheckout={onOpenCheckout}
      />,
    );

    await user.click(screen.getByTestId(`checkbox-abandoned-${checkout.id}`));
    expect(onToggleSelect).toHaveBeenCalledWith(checkout.id);
    expect(onOpenCheckout).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("checkbox-abandoned-all"));
    expect(onSelectAll).toHaveBeenCalled();

    await user.click(screen.getByText("Farzana Akter"));
    expect(onOpenCheckout).toHaveBeenCalledWith(checkout.id);
  });

  it("marks selected rows", () => {
    render(
      <AbandonedCheckoutQueue
        checkouts={[checkout]}
        loading={false}
        error={null}
        actionInFlightId={null}
        onAction={vi.fn()}
        selectedIds={new Set([checkout.id])}
      />,
    );
    expect(screen.getByTestId(`checkbox-abandoned-${checkout.id}`)).toHaveAttribute("aria-checked", "true");
  });

  it("exposes accessible names for the selection checkboxes", () => {
    render(
      <AbandonedCheckoutQueue
        checkouts={[checkout]}
        loading={false}
        error={null}
        actionInFlightId={null}
        onAction={vi.fn()}
        selectedIds={new Set()}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Select all checkouts" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: `Select checkout for ${checkout.customer_name}` }),
    ).toHaveAttribute("data-testid", `checkbox-abandoned-${checkout.id}`);
  });
});
