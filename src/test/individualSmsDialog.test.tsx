import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IndividualSmsDialog } from "@/components/order-editor/IndividualSmsDialog";

const { apiFetch, toast } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/components/ui/sonner", () => ({ toast }));

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

const props = {
  open: true,
  onOpenChange: vi.fn(),
  orderId: "order-1",
  orderNumber: "ML-1001",
  customerName: "Ayesha Rahman",
  phone: "01711111111",
  price: 580,
  address: "Dhanmondi, Dhaka",
};

describe("IndividualSmsDialog", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    props.onOpenChange.mockReset();
  });

  it("starts empty, inserts resolved order values, and sends the exact message", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue(response({ success: true }));
    render(<IndividualSmsDialog {...props} />);

    expect(screen.getByRole("button", { name: /send sms/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /insert customer name/i }));
    await user.click(screen.getByRole("button", { name: /insert order number/i }));
    const textarea = screen.getByRole("textbox", { name: /message/i });
    await user.type(textarea, " is ready.");
    expect(textarea).toHaveValue("Ayesha Rahman#ML-1001 is ready.");

    await user.click(screen.getByRole("button", { name: /send sms/i }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/orders/order-1/send-sms",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Ayesha Rahman#ML-1001 is ready." }),
      }),
    ));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalled();
  });

  it("does not send an empty message and keeps failed text available", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue(response({ error: "Gateway unavailable" }, false, 502));
    render(<IndividualSmsDialog {...props} />);

    const textarea = screen.getByRole("textbox", { name: /message/i });
    fireEvent.change(textarea, { target: { value: "Please call us back." } });
    await user.click(screen.getByRole("button", { name: /send sms/i }));

    expect(await screen.findByText("Gateway unavailable")).toBeInTheDocument();
    expect(textarea).toHaveValue("Please call us back.");
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).toHaveBeenCalled();
  });

  it("fills the courier unreachable template", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue(response({ settings: { contactPhone: "01799999999" } }));
    render(<IndividualSmsDialog {...props} />);

    await user.click(screen.getByRole("radio", { name: /courier unreachable/i }));

    expect(screen.getByRole("textbox", { name: /message/i })).toHaveValue(
      "প্রিয় Ayesha Rahman, কুরিয়ার আপনার অর্ডার #ML-1001 নিয়ে আপনাকে পাচ্ছে না। অনুগ্রহ করে কলটি রিসিভ করুন অথবা 01799999999-এ কল করুন।",
    );
  });

  it("uses the Mango Lover BD phone when storefront settings do not have one", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue(response({ settings: { contactPhone: null } }));
    render(<IndividualSmsDialog {...props} />);

    await user.click(screen.getByRole("radio", { name: /courier unreachable/i }));

    expect(screen.getByRole("textbox", { name: /message/i })).toHaveValue(
      "প্রিয় Ayesha Rahman, কুরিয়ার আপনার অর্ডার #ML-1001 নিয়ে আপনাকে পাচ্ছে না। অনুগ্রহ করে কলটি রিসিভ করুন অথবা +8801301636461-এ কল করুন।",
    );
  });
});
