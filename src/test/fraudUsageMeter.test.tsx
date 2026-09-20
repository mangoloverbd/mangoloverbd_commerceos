import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FraudUsageMeter } from "@/components/FraudUsageMeter";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function renderMeter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FraudUsageMeter />
    </QueryClientProvider>,
  );
}

describe("FraudUsageMeter", () => {
  beforeEach(() => { apiFetch.mockReset(); });

  it("shows today's usage against the daily limit", async () => {
    apiFetch.mockResolvedValue(ok({
      daily_limit: 1000, used_today: 230, remaining_today: 770,
      limit_resets_at: "2026-09-19T23:59:59+06:00",
      package: { name: "Professional", days_remaining: 49 },
    }));
    renderMeter();

    expect(await screen.findByText("770")).toBeInTheDocument();
    expect(screen.getByText(/230 used/)).toBeInTheDocument();
    expect(screen.getByText(/1000/)).toBeInTheDocument();
  });

  it("names the plan and its remaining days when one is active", async () => {
    apiFetch.mockResolvedValue(ok({
      daily_limit: 1000, used_today: 10, remaining_today: 990,
      limit_resets_at: "2026-09-19T23:59:59+06:00",
      package: { name: "Professional", days_remaining: 49 },
    }));
    renderMeter();

    expect(await screen.findByText(/Professional/)).toBeInTheDocument();
    expect(screen.getByText(/49 days/)).toBeInTheDocument();
  });

  it("warns when the remaining budget drops into the reserve", async () => {
    apiFetch.mockResolvedValue(ok({
      daily_limit: 1000, used_today: 960, remaining_today: 40,
      limit_resets_at: "2026-09-19T23:59:59+06:00", package: null,
    }));
    renderMeter();

    const remaining = await screen.findByText("40");
    expect(remaining.className).toContain("d05555");
  });

  it("renders nothing when FraudShield usage is unavailable", async () => {
    apiFetch.mockResolvedValue(ok({}));
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <FraudUsageMeter />
      </QueryClientProvider>,
    );

    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(container.querySelector("[aria-label='FraudShield daily usage']")).toBeNull();
  });
});
