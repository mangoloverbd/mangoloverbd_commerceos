import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FraudPanel } from "@/components/order-editor/FraudPanel";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

const SAFE_PAYLOAD = {
  courierData: {
    steadfast: { name: "Steadfast", logo: "https://x/s.png", total_parcel: 25, success_parcel: 24, cancelled_parcel: 1, success_ratio: 96 },
    pathao: { name: "Pathao", logo: "https://x/p.png", total_parcel: 20, success_parcel: 18, cancelled_parcel: 2, success_ratio: 90 },
  },
  reviews: [
    { commenter_phone: "01800000000", rating: 5, comment: "Genuine buyer, paid on time.", created_at: "2026-05-01T10:15:00.000000Z" },
  ],
  fraudRiskScore: { score: 12, level: "safe", label: "নিরাপদ", breakdown: { success: 6, reports: 0, cancel: 4, volume: 2 } },
};

const SAFE_SUMMARY = { total_parcels: 45, total_delivered: 42, total_cancel: 3, success_rate: 93, fraud_risk: "safe" };

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function renderPanel(phone = "01711111111") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FraudPanel phone={phone} />
    </QueryClientProvider>,
  );
}

describe("FraudPanel", () => {
  beforeEach(() => { apiFetch.mockReset(); });

  it("reads from the cache-only endpoint and never posts on mount", async () => {
    apiFetch.mockResolvedValue(ok({ phone: "01711111111", status: "ok", payload: SAFE_PAYLOAD, summary: SAFE_SUMMARY, checkedAt: new Date().toISOString() }));
    renderPanel();

    await screen.findByText("93%");
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch.mock.calls[0][0]).toContain("/api/fraud/lookup?phone=01711111111");
    expect(apiFetch.mock.calls[0][1]?.method ?? "GET").toBe("GET");
  });

  it("shows the safe summary collapsed, with couriers hidden until expanded", async () => {
    apiFetch.mockResolvedValue(ok({ phone: "01711111111", status: "ok", payload: SAFE_PAYLOAD, summary: SAFE_SUMMARY, checkedAt: new Date().toISOString() }));
    renderPanel();

    await screen.findByText("Safe");
    expect(screen.getByText(/42 delivered/)).toBeInTheDocument();
    expect(screen.getByText(/3 cancelled/)).toBeInTheDocument();
    expect(screen.queryByText("Steadfast")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /details/i }));
    expect(screen.getByText("Steadfast")).toBeInTheDocument();
    expect(screen.getByText("96%")).toBeInTheDocument();
  });

  it("auto-expands a high-risk customer without a click", async () => {
    const payload = { ...SAFE_PAYLOAD, fraudRiskScore: { score: 78, level: "high", label: "ঝুঁকিপূর্ণ", breakdown: { success: 1, reports: 3, cancel: 24, volume: 2 } } };
    apiFetch.mockResolvedValue(ok({ phone: "01711111111", status: "ok", payload, summary: { ...SAFE_SUMMARY, success_rate: 33, fraud_risk: "high" }, checkedAt: new Date().toISOString() }));
    renderPanel();

    await screen.findByText("High risk");
    expect(screen.getByText("Steadfast")).toBeInTheDocument();
  });

  it("masks reviewer phone numbers", async () => {
    apiFetch.mockResolvedValue(ok({ phone: "01711111111", status: "ok", payload: SAFE_PAYLOAD, summary: SAFE_SUMMARY, checkedAt: new Date().toISOString() }));
    renderPanel();

    await screen.findByText("Safe");
    await userEvent.click(screen.getByRole("button", { name: /details/i }));
    expect(screen.getByText(/018\*\*\*\*0000/)).toBeInTheDocument();
    expect(screen.queryByText("01800000000")).not.toBeInTheDocument();
  });

  it("renders without a reviews section when the API omits the key", async () => {
    const payload = { ...SAFE_PAYLOAD };
    delete (payload as { reviews?: unknown }).reviews;
    apiFetch.mockResolvedValue(ok({ phone: "01711111111", status: "ok", payload, summary: SAFE_SUMMARY, checkedAt: new Date().toISOString() }));
    renderPanel();

    await screen.findByText("Safe");
    await userEvent.click(screen.getByRole("button", { name: /details/i }));
    expect(screen.queryByText(/reviews from other merchants/i)).not.toBeInTheDocument();
  });

  it("offers a Check button and spends a request only when it is pressed", async () => {
    apiFetch.mockResolvedValueOnce(ok({ phone: "01711111111", status: null }));
    renderPanel();

    const check = await screen.findByRole("button", { name: /^check$/i });
    expect(apiFetch).toHaveBeenCalledTimes(1);

    apiFetch.mockResolvedValueOnce(ok({ phone: "01711111111", status: "ok", payload: SAFE_PAYLOAD, summary: SAFE_SUMMARY, checkedAt: new Date().toISOString(), spentRequest: true }));
    await userEvent.click(check);

    await screen.findByText("Safe");
    expect(apiFetch.mock.calls[1][0]).toBe("/api/fraud/check");
    expect(apiFetch.mock.calls[1][1].method).toBe("POST");
  });

  it("treats a customer with no courier history as new, not risky", async () => {
    apiFetch.mockResolvedValue(ok({
      phone: "01711111111", status: "ok",
      payload: { courierData: {} },
      summary: { total_parcels: 0, total_delivered: 0, total_cancel: 0, success_rate: 0, fraud_risk: "low" },
      checkedAt: new Date().toISOString(),
    }));
    renderPanel();

    expect(await screen.findByText(/new customer/i)).toBeInTheDocument();
    expect(screen.queryByText(/high risk/i)).not.toBeInTheDocument();
  });

  it("surfaces a failed check with a retry", async () => {
    apiFetch.mockResolvedValue(ok({
      phone: "01711111111", status: "error", payload: null, summary: null,
      errorMessage: "FraudShield server returned a 502 Bad Gateway.", checkedAt: new Date().toISOString(),
    }));
    renderPanel();

    expect(await screen.findByText(/check failed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("disables the button after a quota error instead of letting it be retried", async () => {
    apiFetch.mockResolvedValueOnce(ok({ phone: "01711111111", status: null }));
    renderPanel();

    const check = await screen.findByRole("button", { name: /^check$/i });
    apiFetch.mockResolvedValueOnce(ok({
      phone: "01711111111", status: "error", payload: null, summary: null,
      errorMessage: "Daily FraudShield limit reached. Checks resume after the limit resets.",
      checkedAt: new Date().toISOString(), spentRequest: true,
    }));
    await userEvent.click(check);

    await screen.findByText(/daily limit reached/i);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^check$/i })).toBeDisabled();
    });
  });

  it("labels the live score breakdown in plain words, not api keys", async () => {
    const payload = {
      ...SAFE_PAYLOAD,
      fraudRiskScore: {
        score: 25, level: "moderate", label: "স্বাভাবিক",
        breakdown: { success_component: 9.2, report_component: 70, cancel_component: 13.8, volume_component: 5, report_count: 2, total_reviews: 2 },
      },
    };
    apiFetch.mockResolvedValue(ok({ phone: "01711111111", status: "ok", payload, summary: SAFE_SUMMARY, checkedAt: new Date().toISOString() }));
    renderPanel();

    await screen.findByText("Caution");
    await userEvent.click(screen.getByRole("button", { name: /details/i }));
    for (const label of ["Success", "Reports", "Cancels", "Volume", "Reports filed", "Reviews"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText("success_component")).not.toBeInTheDocument();
    expect(screen.queryByText("report_component")).not.toBeInTheDocument();
    expect(screen.queryByText("cancel_component")).not.toBeInTheDocument();
  });

  it("starts expanded when asked, showing couriers without a click", async () => {
    apiFetch.mockResolvedValue(ok({ phone: "01711111111", status: "ok", payload: SAFE_PAYLOAD, summary: SAFE_SUMMARY, checkedAt: new Date().toISOString() }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <FraudPanel phone="01711111111" defaultExpanded />
      </QueryClientProvider>,
    );

    await screen.findByText("Safe");
    expect(screen.getByText("Steadfast")).toBeInTheDocument();
  });

  it("does not query at all without a valid BD phone", () => {
    renderPanel("012");
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
