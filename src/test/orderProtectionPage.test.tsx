import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { fetchProtectionReviews, updateProtectionReview } = vi.hoisted(() => ({
  fetchProtectionReviews: vi.fn(),
  updateProtectionReview: vi.fn(),
}));

vi.mock("@/lib/orderProtection", () => ({
  fetchProtectionReviews,
  updateProtectionReview,
}));

import OrderProtection from "@/pages/OrderProtection";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><OrderProtection /></QueryClientProvider>);
}

describe("order protection dashboard", () => {
  beforeEach(() => {
    fetchProtectionReviews.mockResolvedValue({ reviews: [{
      id: "review-1",
      status: "on_hold",
      score: 65,
      reason_codes: ["address_incomplete", "phone_network_change"],
      reason_labels: { address_incomplete: "Incomplete address" },
      customer_name: "Rahim Uddin",
      phone: "01712345678",
      address: "House 1, Dhanmondi, Dhaka",
      items: [
        { productName: "Katimon Mango", variantName: "6KG", quantity: 2, unitPrice: 1180 },
        { product_name: "Honey", quantity: 1, unit_price: 800 },
      ],
      source_route: "public_v1",
      created_at: "2026-09-12T08:00:00.000Z",
    }] });
    updateProtectionReview.mockResolvedValue({ orderRef: "ML-1001" });
  });

  test("shows one labelled total and no repeated line price for a single-product order", async () => {
    fetchProtectionReviews.mockResolvedValue({ reviews: [{
      id: "review-2",
      status: "on_hold",
      score: 20,
      reason_codes: ["address_incomplete"],
      reason_labels: { address_incomplete: "Incomplete address" },
      customer_name: "Misbah Fakir",
      phone: "01924198607",
      address: "Kulaura, Moulvibazar",
      items: [{ productName: "Pumpkin Bori", variantName: "1 kg", quantity: 1, unitPrice: 700 }],
      source_route: "public_v1",
      created_at: "2026-09-24T07:43:00.000Z",
    }] });
    renderPage();

    const total = await screen.findByTestId("protection-total-review-2");
    expect(total).toHaveTextContent("Total ৳700");
    const product = screen.getByTestId("protection-product-review-2-0");
    expect(product).toHaveTextContent("Pumpkin Bori — 1 kg × 1");
    expect(product).not.toHaveTextContent("৳");
  });

  test("shows the abandoned-style held order row with protection details", async () => {
    renderPage();

    expect(await screen.findByText("Rahim Uddin")).toBeInTheDocument();
    expect(screen.getByText("On hold")).toBeInTheDocument();
    expect(screen.getByText("Storefront checkout")).toBeInTheDocument();
    expect(screen.getByText("65")).toBeInTheDocument();
    // Each order is its own card: header total, one line per product with its
    // line price, and plain-language reasons.
    const card = screen.getByTestId("checkbox-protection-review-1").closest("article");
    expect(card).toHaveClass("bg-white");
    expect(screen.getByTestId("protection-total-review-1")).toHaveTextContent("Total ৳3,160");
    expect(screen.getByTestId("protection-product-review-1-0")).toHaveTextContent("Katimon Mango — 6KG × 2");
    expect(screen.getByTestId("protection-product-review-1-0")).toHaveTextContent("৳2,360");
    expect(screen.getByTestId("protection-product-review-1-1")).toHaveTextContent("Honey × 1");
    expect(screen.getByTestId("protection-product-review-1-1")).toHaveTextContent("৳800");
    expect(screen.getByText("Why held")).toBeInTheDocument();
    expect(screen.getByText("Incomplete address")).toBeInTheDocument();
    expect(screen.getByText("Phone network change")).toBeInTheDocument();
    expect(screen.queryByText("address_incomplete")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select all reviews" })).toBeInTheDocument();
    expect(screen.getByTestId("checkbox-protection-all").parentElement).toHaveClass("px-2", "sm:px-3");
    // Contact tools and decisions live in a footer, with Accept last.
    const contact = screen.getByTestId("protection-contact-actions-review-1");
    const decisions = screen.getByTestId("protection-decision-actions-review-1");
    expect(contact).toContainElement(screen.getByRole("link", { name: /call 01712345678/i }));
    expect(contact).toContainElement(screen.getByRole("button", { name: /contact status: awaiting contact/i }));
    expect(decisions.lastElementChild).toHaveAccessibleName(/approve order for rahim uddin/i);
    expect(screen.getByRole("button", { name: /copy review summary/i })).toHaveTextContent("Copy summary");
    expect(screen.getByTestId("risk-reasons-review-1")).toHaveClass("flex-wrap");
    expect(screen.getByTestId("risk-reasons-review-1")).not.toHaveClass("flex-nowrap", "overflow-x-auto");
    expect(screen.getByRole("link", { name: /call 01712345678/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open whatsapp for 01712345678/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy review summary/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /contact status: awaiting contact/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dismiss review/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject order for/i })).toBeInTheDocument();
  });

  test("updates the contact status dropdown", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Contact status: Awaiting contact" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Contacted" }));

    expect(screen.getByRole("button", { name: "Contact status: Contacted" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Contact status: Awaiting contact" })).not.toBeInTheDocument();
    expect(updateProtectionReview).toHaveBeenCalledWith("review-1", "contacted");
  });

  test("restores the saved contact status after loading reviews", async () => {
    fetchProtectionReviews.mockResolvedValueOnce({ reviews: [{
      id: "review-1",
      status: "on_hold",
      contact_status: "contacted",
      score: 65,
      reason_codes: [],
      customer_name: "Rahim Uddin",
      phone: null,
      address: "House 1, Dhanmondi, Dhaka",
      items: [],
      source_route: "public_v1",
      created_at: "2026-09-12T08:00:00.000Z",
    }] });

    renderPage();

    expect(await screen.findByRole("button", { name: "Contact status: Contacted" })).toBeInTheDocument();
  });

  test("staff can explicitly reject a confirmed fake without marking ordinary rejections fake", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /reject as fake/i }));
    expect(updateProtectionReview).toHaveBeenCalledWith("review-1", "reject", "fake");
  });
});
