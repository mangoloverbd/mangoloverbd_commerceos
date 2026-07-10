import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as PricingCard from "@/components/ui/pricing-card";
import Billing from "@/pages/Billing";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

apiFetch.mockImplementation(async (url: string) => {
  if (url === "/api/billing/plan") {
    return {
      ok: true,
      json: async () => ({
        plan: {
          id: "growth",
          name: "Growth",
          price: 3499,
          interval: "monthly",
          status: "trialing",
          renewsAt: "2026-07-17T00:00:00.000Z",
          startedAt: "2026-07-10T00:00:00.000Z",
          trialEndsAt: "2026-07-17T00:00:00.000Z",
        },
      }),
    } as Response;
  }

  if (url === "/api/billing/usage") {
    return {
      ok: true,
      json: async () => ({
        usage: {
          aiInboxReplies: { used: 0, limit: 1500 },
          aiOrderCaptures: { used: 0, limit: 300 },
          aiExtractions: { used: 0, limit: 500 },
          fraudChecks: { used: 0, limit: 300 },
          period: "1 Jul — 31 Jul 2026",
        },
      }),
    } as Response;
  }

  if (url === "/api/billing/invoices") {
    return { ok: true, json: async () => ({ invoices: [] }) } as Response;
  }

  throw new Error(`Unexpected API request: ${url}`);
});

vi.mock("@/lib/api", () => ({ apiFetch }));

function renderBilling() {
  return render(
    <MemoryRouter initialEntries={["/billing"]}>
      <Billing />
    </MemoryRouter>,
  );
}

describe("Billing plans", () => {
  it("composes reusable pricing-card primitives", () => {
    render(
      <PricingCard.Card data-testid="pricing-card">
        <PricingCard.Header>
          <PricingCard.PlanName>Starter</PricingCard.PlanName>
        </PricingCard.Header>
        <PricingCard.Body>
          <PricingCard.List>
            <PricingCard.ListItem>500 orders</PricingCard.ListItem>
          </PricingCard.List>
        </PricingCard.Body>
      </PricingCard.Card>,
    );

    expect(screen.getByTestId("pricing-card")).toHaveClass("backdrop-blur-xl");
    expect(screen.getByText("500 orders")).toBeInTheDocument();
  });

  it("shows Starter and Growth while hiding Pro and Enterprise", async () => {
    renderBilling();

    expect(await screen.findByTestId("plan-starter")).toBeInTheDocument();
    expect(screen.getByTestId("plan-growth")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-pro")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-enterprise")).not.toBeInTheDocument();
  });

  it("gives Growth more included feature rows without enlarging its width", async () => {
    renderBilling();

    const starter = await screen.findByTestId("plan-starter");
    const growth = screen.getByTestId("plan-growth");

    expect(within(growth).getAllByTestId("included-feature").length).toBeGreaterThan(
      within(starter).getAllByTestId("included-feature").length,
    );
    expect(starter).toHaveClass("w-full");
    expect(growth).toHaveClass("w-full");
  });

  it("preserves the existing Stripe checkout endpoint", () => {
    const source = readFileSync(resolve(process.cwd(), "src/pages/Billing.tsx"), "utf8");

    expect(source).toContain('apiFetch("/api/billing/checkout"');
  });
});
