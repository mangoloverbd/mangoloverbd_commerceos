import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MobileProductCards } from "@/components/MobileProductCards";
import { MobileCustomerCards } from "@/components/MobileCustomerCards";
import type { Product } from "@/pages/products/shared";
import type { Customer } from "@/pages/Customers";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1", name: "Test Product", slug: "test-product", description: null,
    url: null, image_url: null, selling_price: 850, compare_at_price: null, cog: 400,
    stock_quantity: 12, weight_kg: null, warehouse_id: null, source_url: null,
    published: true, published_at: null, created_at: "2026-09-11T08:00:00.000Z",
    variants: [], images: [], ...overrides,
  };
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "customer-1", name: "Test Customer", phone: "01700000000", totalOrders: 1,
    totalSpent: 850, averageOrderValue: 850, sources: ["manual"], primarySource: "manual",
    riskLevel: "low", segments: [], lifecycleStage: "new", campaignSegments: [],
    lastOrderAt: "2026-09-11T08:00:00.000Z", timeline: [], ...overrides,
  };
}

describe("mobile catalog cards", () => {
  it("shows product name, stock, price, and edit action on mobile", async () => {
    const user = userEvent.setup();
    const onEditProduct = vi.fn();
    render(
      <MobileProductCards
        products={[makeProduct({ name: "Alphonso Mango", stock_quantity: 12, selling_price: 850 })]}
        onEditProduct={onEditProduct}
        selectedProductIds={new Set()}
        onToggleSelection={vi.fn()}
        renderActions={() => null}
      />,
    );
    expect(screen.getByText("Alphonso Mango")).toBeInTheDocument();
    expect(screen.getByText(/৳850/)).toBeInTheDocument();
    expect(screen.getByText("12 units")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /edit alphonso mango/i }));
    expect(onEditProduct).toHaveBeenCalledWith("product-1");
  });

  it("selects a customer card using the existing callback", async () => {
    const user = userEvent.setup();
    const customer = makeCustomer({ name: "Nusrat Jahan", totalOrders: 3, totalSpent: 2400 });
    const onSelect = vi.fn();
    render(<MobileCustomerCards customers={[customer]} onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /open customer nusrat jahan/i }));
    expect(onSelect).toHaveBeenCalledWith(customer);
  });
});
