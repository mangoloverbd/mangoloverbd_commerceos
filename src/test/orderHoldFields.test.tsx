import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { OrderHoldFields, type OrderHoldMetadata } from "@/components/orders/OrderHoldFields";

function renderFields(value: OrderHoldMetadata = { hold_reason_code: null, hold_reason_detail: null, hold_until_date: null }) {
  const onChange = vi.fn();
  function Harness() {
    const [metadata, setMetadata] = useState(value);
    return <OrderHoldFields value={metadata} onChange={(next) => { onChange(next); setMetadata(next); }} />;
  }
  const view = render(<Harness />);
  return { ...view, onChange };
}

describe("OrderHoldFields", () => {
  it("opens the Bengali reason menu above the trigger and shows no date until selected", async () => {
    const user = userEvent.setup();
    renderFields();
    await user.click(screen.getByRole("button", { name: /Hold reason/ }));
    const listbox = await screen.findByRole("listbox");
    expect(listbox.closest("[data-placement]")).toHaveAttribute("data-placement", "top");
    expect(screen.getByRole("option", { name: "অগ্রিম পেমেন্টের জন্য অর্ডার হোল্ডে রাখা হয়েছে" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "অন্যান্য" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hold return date" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Other hold details" })).not.toBeInTheDocument();
  });

  it("shows a required return date only for the customer-requested-after-date reason", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFields();
    await user.click(screen.getByRole("button", { name: /Hold reason/ }));
    await user.click(await screen.findByRole("option", { name: "গ্রাহক নির্দিষ্ট তারিখের পরে পার্সেল নিতে চান" }));

    const date = screen.getByRole("button", { name: "Hold return date" });
    expect(date).toHaveAttribute("aria-required", "true");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      hold_reason_code: "customer_requested_after_date",
      hold_reason_detail: null,
      hold_until_date: null,
    }));

    await user.click(date);
    const nextMonth = await screen.findByRole("button", { name: "Go to next month" });
    await user.click(nextMonth);
    await user.click(await screen.findByText("2", { exact: true }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ hold_until_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));
  });

  it("shows optional detail for Other and clears date metadata when the reason changes", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFields({
      hold_reason_code: "customer_requested_after_date",
      hold_reason_detail: null,
      hold_until_date: "2026-10-02",
    });
    await user.click(screen.getByRole("button", { name: /Hold reason/ }));
    await user.click(await screen.findByRole("option", { name: "অন্যান্য" }));

    expect(screen.getByRole("textbox", { name: "Other hold details" })).not.toBeRequired();
    expect(screen.queryByLabelText("Hold return date")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({
      hold_reason_code: "other",
      hold_reason_detail: null,
      hold_until_date: null,
    });

    await user.type(screen.getByRole("textbox", { name: "Other hold details" }), "অগ্রিম টাকা বাকি");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ hold_reason_detail: "অগ্রিম টাকা বাকি" }));
  });
});
