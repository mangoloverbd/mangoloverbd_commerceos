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

describe("order protection dashboard", () => {
  beforeEach(() => {
    fetchProtectionReviews.mockResolvedValue({ reviews: [{
      id: "review-1",
      status: "on_hold",
      score: 65,
      reason_codes: ["phone_velocity_15m", "phone_network_change"],
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

  test("shows the abandoned-style held order row with protection details", async () => {
    render(<OrderProtection />);

    expect(await screen.findByText("Rahim Uddin")).toBeInTheDocument();
    expect(screen.getByText("On hold")).toBeInTheDocument();
    expect(screen.getByText("Storefront checkout")).toBeInTheDocument();
    expect(screen.getByText("65")).toBeInTheDocument();
    expect(screen.getByText("Katimon Mango — 6KG × 2 · ৳1,180")).toBeInTheDocument();
    expect(screen.getByText("Honey × 1 · ৳800")).toBeInTheDocument();
    expect(screen.getByTestId("protection-product-review-1-0")).toHaveClass("bg-background-secondary-default", "max-w-full");
    expect(screen.getByText("phone_velocity_15m")).toBeInTheDocument();
    expect(screen.getByText("phone_network_change")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select all reviews" })).toBeInTheDocument();
    expect(screen.getByTestId("checkbox-protection-all").parentElement).toHaveClass("px-2", "sm:px-3");
    expect(screen.getByTestId("checkbox-protection-review-1").closest("article")).toHaveClass("gap-2", "px-2", "sm:px-3", "bg-[#f5f5f5]");
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
    render(<OrderProtection />);

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

    render(<OrderProtection />);

    expect(await screen.findByRole("button", { name: "Contact status: Contacted" })).toBeInTheDocument();
  });

  test("staff can explicitly reject a confirmed fake without marking ordinary rejections fake", async () => {
    const user = userEvent.setup();
    render(<OrderProtection />);
    await user.click(await screen.findByRole("button", { name: /reject as fake/i }));
    expect(updateProtectionReview).toHaveBeenCalledWith("review-1", "reject", "fake");
  });
});
