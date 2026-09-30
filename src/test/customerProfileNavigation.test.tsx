import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomerDataTable } from "@/components/CustomerDataTable";
import { MobileCustomerCards } from "@/components/MobileCustomerCards";
import type { Customer } from "@/pages/Customers";
import { customerProfileHref, customerPrefillFromState, customerInboxTarget } from "@/lib/customerProfile";

const customer: Customer = { id: "01712345678", name: "Rina", phone: "01712345678", totalOrders: 1, totalSpent: 500, averageOrderValue: 500, sources: ["website"], primarySource: "website", riskLevel: "low", segments: [], lifecycleStage: "new", campaignSegments: [], lastOrderAt: null, timeline: [] };

describe("customer profile entry points", () => {
  it("opens desktop profiles without selecting the customer", async () => {
    const user = userEvent.setup(); const open = vi.fn(); const select = vi.fn();
    render(<CustomerDataTable customers={[customer]} loading={false} selectedIds={new Set()} onSelectedIdsChange={select} onOpenCustomer={open} />);
    const link = screen.getAllByRole("link", { name: "Rina" }).find((element) => element.closest("tr"))!;
    expect(link).toHaveAttribute("href", "/customers/01712345678");
    await user.click(link);
    expect(open).toHaveBeenCalledWith(customer, expect.objectContaining({ page: 1 }));
    expect(select).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole("checkbox", { name: "Select Rina" })[0]);
    expect(select).toHaveBeenCalledWith(new Set([customer.id]));
  });
  it("opens a desktop customer by clicking the row instead of selecting it for SMS", async () => {
    const user = userEvent.setup(); const open = vi.fn(); const select = vi.fn();
    render(<CustomerDataTable customers={[customer]} loading={false} selectedIds={new Set()} onSelectedIdsChange={select} onOpenCustomer={open} />);
    const row = screen.getAllByRole("link", { name: "Rina" }).find((element) => element.closest("tr"))!.closest("tr")!;
    await user.click(row);
    expect(open).toHaveBeenCalledWith(customer, expect.objectContaining({ page: 1 }));
    expect(select).not.toHaveBeenCalled();
  });
  it("opens mobile profiles independently of bulk selection", async () => {
    const user = userEvent.setup(); const open = vi.fn(); const select = vi.fn();
    render(<MobileCustomerCards customers={[customer]} selectedIds={new Set()} onToggle={select} onOpenCustomer={open} />);
    await user.click(screen.getByRole("link", { name: "Rina" }));
    expect(open).toHaveBeenCalledWith(customer);
    expect(select).not.toHaveBeenCalled();
  });
  it("opens a mobile customer by tapping the card and keeps selection on its checkbox", async () => {
    const user = userEvent.setup(); const open = vi.fn(); const select = vi.fn();
    render(<MobileCustomerCards customers={[customer]} selectedIds={new Set()} onToggle={select} onOpenCustomer={open} />);
    await user.click(screen.getByRole("link", { name: "Rina" }).closest("article")!);
    expect(open).toHaveBeenCalledWith(customer);
    expect(select).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: "Select Rina" }));
    expect(select).toHaveBeenCalledWith(customer.id, true);
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("restores customer queue page and sorting after navigation", () => {
    const customers = Array.from({ length: 55 }, (_, index) => ({ ...customer, id: `c${index}`, name: `Customer ${String(index).padStart(2, "0")}` }));
    render(<CustomerDataTable customers={customers} loading={false} selectedIds={new Set()} onSelectedIdsChange={vi.fn()} initialView={{ page: 2, sortDescriptor: { column: "name", direction: "ascending" } }} />);
    expect(screen.getByText("Showing 51–55 of 55 customers")).toBeInTheDocument();
  });
  it("matches backend customer identity normalization for order profile links", () => {
    expect(customerProfileHref({ id: "a", phone: "+880 1712-345678" })).toBe("/customers/01712345678");
    expect(customerProfileHref({ id: "a", phone: "1712345678" })).toBe("/customers/01712345678");
    expect(customerProfileHref({ id: "a", phone: "88001712345678" })).toBe("/customers/order%3Aa");
  });
  it("accepts only text fields when initializing order creation from a profile", () => {
    expect(customerPrefillFromState({ customerPrefill: { customerName: "Rina", phone: "01712345678", address: "Dhaka" } })).toEqual({ customerName: "Rina", phone: "01712345678", address: "Dhaka" });
    expect(customerPrefillFromState({ customerPrefill: { customerName: 42, phone: {}, address: null } })).toEqual({ customerName: "", phone: "", address: "" });
  });
  it("targets an inbox order from a profile without exposing unrelated orders", () => {
    const rows = [{ id: "first" }, { id: "second" }];
    expect(customerInboxTarget(rows, "second")).toEqual([{ id: "second" }]);
    expect(customerInboxTarget(rows, "missing")).toEqual([]);
    expect(customerInboxTarget(rows, null)).toEqual(rows);
  });
});
