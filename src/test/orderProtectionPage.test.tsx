import { render, screen } from "@testing-library/react";
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
      items: [{ productName: "Honey", quantity: 1 }],
      created_at: "2026-09-12T08:00:00.000Z",
    }] });
    updateProtectionReview.mockResolvedValue({ orderRef: "ML-1001" });
  });

  test("shows the held order score, reasons, and review actions", async () => {
    render(<OrderProtection />);

    expect(await screen.findByText("Rahim Uddin")).toBeInTheDocument();
    expect(screen.getByText("65")).toBeInTheDocument();
    expect(screen.getByText("phone_velocity_15m")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });
});
