import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomerPanel } from "@/components/order-editor/CustomerPanel";

const apiFetch = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ phone: "01711111111", status: null }) }));
vi.mock("@/lib/api", () => ({ apiFetch }));

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("fraud panel placement", () => {
  it("renders the strip inside the customer panel", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <CustomerPanel
          order={{ id: "order-1", price: 500 }}
          customer={{ customerName: "Ayesha", phone: "01711111111", address: "Dhaka" }}
          onApply={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText("Customer risk")).toBeInTheDocument();
  });

  it("drops the dead risk_level field that never had a matching key", () => {
    const panel = read("src/components/order-editor/CustomerPanel.tsx");
    const detail = read("src/pages/OrderDetail.tsx");

    expect(panel).not.toContain("risk_level");
    expect(detail).not.toContain("risk_level");
    expect(panel).not.toContain('<DetailField label="Fraud"');
  });

  it("replaces the write-only fraud checkbox on the new order page with the live strip", () => {
    const newOrder = read("src/pages/NewOrder.tsx");

    expect(newOrder).toContain("FraudPanel");
    expect(newOrder).toContain("phone={phone}");
    expect(newOrder).not.toContain("runFraudCheck");
    expect(newOrder).not.toContain('apiFetch("/api/check-fraud"');
  });

  it("keeps the abandoned checkout surface on the shared customer panel", () => {
    expect(read("src/pages/AbandonedDetail.tsx")).toContain("CustomerPanel");
  });

  it("leaves the inbox table on its own cell but routes its checks through the cache", () => {
    expect(read("src/pages/InboxOrders.tsx")).toContain("InboxFraudCell");
    expect(read("server/index.js")).toContain("runFraudCheck(supabase, orgId,");
  });
});
