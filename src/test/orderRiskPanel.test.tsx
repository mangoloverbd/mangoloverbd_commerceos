import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { OrderRiskPanel } from "@/components/risk/OrderRiskPanel";
import type { RiskAttempt } from "@/lib/orderRisk";

const { fetchOrderRisk } = vi.hoisted(() => ({ fetchOrderRisk: vi.fn() }));
vi.mock("@/lib/orderRisk", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/orderRisk")>()), fetchOrderRisk }));

const attempt: RiskAttempt = {
  id: "attempt-1", created_at: "2026-09-24T06:00:00Z", route: "checkout", mode: "shadow",
  decision: "HOLD", score: 65, customer_name: "Ayesha Rahman", phone: "01711111111", address: "Dhanmondi, Dhaka",
  signals: [
    { code: "device_many_phones", family: "DEVICE", severity: "high", points: 40, label: "One device, many phones", evidence: "4 phones on this device in 24h" },
    { code: "good_delivery", family: "HISTORY", severity: "trust", points: -15, label: "Good delivery record", evidence: "5 delivered orders" },
    { code: "bot_check_failed", family: "BEHAVIOUR", severity: "medium", points: 20, label: "Bot check failed", evidence: "hidden" },
  ],
  reasons: ["independent_high_families"], label: null, context_trusted: true, order_id: "order-1", review_id: null,
  network_type: "Mobile", geo_city: "Dhaka", user_agent_summary: "Chrome on Android",
  ip_address: "103.12.44.7", ip_prefix: "v4:103.12.44.0/24",
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><OrderRiskPanel orderId="order-1" /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OrderRiskPanel", () => {
  it("summarises the decision, score, and context with colored chips", async () => {
    fetchOrderRisk.mockResolvedValue({ attempt });
    renderPanel();

    expect(await screen.findByText("Held for review")).toHaveClass("bg-status-yellow-background");
    const score = screen.getByTestId("order-risk-score");
    expect(score).toHaveTextContent("65");
    expect(score).toHaveTextContent("/ 100");
    expect(screen.getByText("Shadow · not enforced")).toBeInTheDocument();
    expect(screen.getByText("Signed context")).toHaveClass("bg-status-cyan-background");
  });

  it("lists signals with severity chips and points, hiding retired signals", async () => {
    fetchOrderRisk.mockResolvedValue({ attempt });
    renderPanel();

    const signals = await screen.findByRole("list", { name: "Risk signals" });
    const device = within(signals).getByText("One device, many phones").closest("li")!;
    expect(within(device).getByText("High")).toHaveClass("bg-status-rose-background");
    expect(within(device).getByText("+40")).toBeInTheDocument();
    expect(within(device).getByText("4 phones on this device in 24h")).toBeInTheDocument();
    const trust = within(signals).getByText("Good delivery record").closest("li")!;
    expect(within(trust).getByText("Trust")).toHaveClass("bg-status-lime-background");
    expect(within(trust).getByText("−15")).toBeInTheDocument();
    expect(within(signals).queryByText("Bot check failed")).not.toBeInTheDocument();
    expect(screen.getByText("Strong signals from independent checks")).toBeInTheDocument();
  });

  it("shows customer and network details", async () => {
    fetchOrderRisk.mockResolvedValue({ attempt });
    renderPanel();

    expect(await screen.findByText("Ayesha Rahman")).toBeInTheDocument();
    expect(screen.getByText("Dhanmondi, Dhaka")).toBeInTheDocument();
    expect(screen.getByText("Chrome on Android")).toBeInTheDocument();
    expect(screen.getByText("Mobile")).toBeInTheDocument();
  });

  it("collapses the signal column into a chip when nothing fired", async () => {
    fetchOrderRisk.mockResolvedValue({ attempt: { ...attempt, decision: "ALLOW", score: 0, signals: [], reasons: [] } });
    renderPanel();

    expect(await screen.findByText("No risk signals")).toHaveClass("bg-status-lime-background");
    expect(screen.queryByRole("heading", { name: "Signals" })).not.toBeInTheDocument();
    expect(screen.getByTestId("order-risk-details")).toHaveClass("lg:grid-cols-2");
  });

  it("shows the customer's IP, or the saved network block for older orders", async () => {
    fetchOrderRisk.mockResolvedValue({ attempt });
    const { unmount } = renderPanel();
    expect(await screen.findByText("103.12.44.7")).toBeInTheDocument();
    unmount();

    fetchOrderRisk.mockResolvedValue({ attempt: { ...attempt, ip_address: null } });
    renderPanel();
    expect(await screen.findByText("103.12.44.x · full IP not saved")).toBeInTheDocument();
  });

  it("explains why an order made from an abandoned checkout has no risk check", async () => {
    fetchOrderRisk.mockResolvedValue({ attempt: null, no_check_reason: "abandoned_checkout" });
    renderPanel();
    expect(await screen.findByText("No risk check for this order")).toBeInTheDocument();
    expect(screen.getByText(/created by staff from an abandoned checkout/)).toBeInTheDocument();
  });

  it("explains when no assessment was recorded", async () => {
    fetchOrderRisk.mockResolvedValue({ attempt: null });
    renderPanel();
    expect(await screen.findByText("No risk assessment was recorded for this order.")).toBeInTheDocument();
  });
});
