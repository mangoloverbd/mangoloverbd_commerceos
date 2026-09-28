import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomerDataTable } from "@/components/CustomerDataTable";
import { MobileCustomerCards } from "@/components/MobileCustomerCards";
import { CopyButton } from "@/components/ui/copy-button";
import type { Customer } from "@/pages/Customers";

const customer: Customer = {
  id: "c1",
  name: "Ayesha Rahman",
  phone: "01711111111",
  totalOrders: 2,
  totalSpent: 1600,
  averageOrderValue: 800,
  sources: ["website"],
  primarySource: "website",
  riskLevel: "low",
  segments: [],
  lifecycleStage: "repeat",
  campaignSegments: [],
  lastOrderAt: null,
  timeline: [],
};

describe("customer phone copy", () => {
  it("shows the tick before other click work can delay feedback", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    let labelDuringClick = "";
    render(
      <CopyButton
        value={customer.phone}
        onClick={(event) => {
          labelDuringClick = event.currentTarget.getAttribute("aria-label") || "";
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy to clipboard" }));

    expect(labelDuringClick).toBe("Copied");
    expect(screen.getByRole("button", { name: "Copied" })).toBeDisabled();
  });

  it("copies the phone from the desktop table without selecting the customer", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const onSelect = vi.fn();
    render(<CustomerDataTable customers={[customer]} loading={false} selectedIds={new Set()} onSelectedIdsChange={onSelect} />);

    await user.click(screen.getAllByRole("button", { name: "Copy phone number 01711111111" })[0]);

    expect(writeText).toHaveBeenCalledWith("01711111111");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("copies the phone from a mobile card without selecting the customer", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const onSelect = vi.fn();
    render(<MobileCustomerCards customers={[customer]} selectedIds={new Set()} onToggle={onSelect} />);

    await user.click(screen.getByRole("button", { name: "Copy phone number 01711111111" }));

    expect(writeText).toHaveBeenCalledWith("01711111111");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders one page of customers and pages through the rest", async () => {
    const user = userEvent.setup();
    const customers = Array.from({ length: 55 }, (_, index) => ({
      ...customer,
      id: `c${index}`,
      name: `Customer ${String(index).padStart(2, "0")}`,
    }));
    const { container } = render(
      <CustomerDataTable customers={customers} loading={false} selectedIds={new Set()} onSelectedIdsChange={vi.fn()} />,
    );

    expect(container.querySelectorAll('button[aria-label^="Copy phone number"]')).toHaveLength(100);
    expect(screen.getByText("Showing 1–50 of 55 customers")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go to page 2" }));
    expect(container.querySelectorAll('button[aria-label^="Copy phone number"]')).toHaveLength(10);
    expect(screen.getByText("Showing 51–55 of 55 customers")).toBeInTheDocument();
  });

  it("shows no copy button when the customer has no phone", () => {
    render(<MobileCustomerCards customers={[{ ...customer, phone: "" }]} selectedIds={new Set()} onToggle={vi.fn()} />);

    expect(screen.getByText("No phone")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copy phone number/ })).not.toBeInTheDocument();
  });

  it("reveals the tick at full opacity with no blur or fade, so it reads instantly", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const { container } = render(
      <MobileCustomerCards customers={[customer]} selectedIds={new Set()} onToggle={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Copy phone number 01711111111" }));

    const tickWrapper = container.querySelector(".lucide-check")?.parentElement;
    expect(tickWrapper).toBeTruthy();
    // Fully opaque and unblurred on the first painted frame — the old version
    // faded in from opacity-0 + blur over 200ms, which read as a late tick.
    expect(tickWrapper?.className).toContain("opacity-100");
    expect(tickWrapper?.className).not.toContain("opacity-0");
    expect(tickWrapper?.className).not.toContain("blur");
    expect(tickWrapper?.className).toContain("copy-tick-pop");
  });

  it("keeps swallowing clicks while the tick is showing, so the row cannot toggle selection", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const onSelect = vi.fn();
    render(<CustomerDataTable customers={[customer]} loading={false} selectedIds={new Set()} onSelectedIdsChange={onSelect} />);

    const copyButton = screen.getAllByRole("button", {
      name: "Copy phone number 01711111111",
    })[0];
    await user.click(copyButton);

    // The button is disabled while confirming, but it must not become
    // click-through (pointer-events: none would hand the click to the row).
    expect(copyButton).toBeDisabled();
    expect(copyButton.className).not.toContain("pointer-events-none");

    await user.click(copyButton);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
