import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import CustomerDetail from "@/pages/CustomerDetail";
import { buildCustomerProfile } from "../../server/customerProfile.js";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
const phone = "01712345678";
const noteId = "11111111-1111-4111-8111-111111111111";
const profile = buildCustomerProfile({ customerId: phone, orders: [{ id: noteId, phone, customer_name: "Rina", address: "Dhaka", product: "Honey", quantity: 2, price: 500, status: "delivered", created_at: "2026-09-01T00:00:00Z" }, { id: "cancelled", phone, price: 900, status: "cancelled", created_at: "2026-09-02T00:00:00Z" }], now: new Date("2026-09-30T00:00:00Z") });
function response(data: unknown, status = 200) { return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })); }
function Location() { const location = useLocation(); return <pre data-testid="location">{JSON.stringify({ pathname: location.pathname, state: location.state })}</pre>; }
let saved: { context: { tags: string[]; followUpOn: string | null; followUpReason: string; version: number; updatedAt: string | null; updatedByName: string | null }; notes: { items: unknown[]; page: number; total: number; totalPages: number } };
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/customers/${phone}`]}><Routes><Route path="/customers/:id" element={<CustomerDetail />} /><Route path="/orders/new" element={<Location />} /></Routes></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => noteId });
  saved = { context: { tags: [], followUpOn: null, followUpReason: "", version: 0, updatedAt: null, updatedByName: null }, notes: { items: [], page: 1, total: 0, totalPages: 1 } };
  vi.mocked(apiFetch).mockReset().mockImplementation((url, options) => {
    if (url.startsWith("/api/fraud/lookup")) return response({ phone, status: null });
    if (options?.method === "POST") {
      const input = JSON.parse(String(options.body));
      const note = { ...input, authorName: "Support", authorId: "staff", createdAt: "2026-09-30T00:00:00Z" };
      saved.notes = { items: [note], page: 1, total: 1, totalPages: 1 };
      return response({ note }, 201);
    }
    if (options?.method === "PATCH") {
      const input = JSON.parse(String(options.body));
      saved.context = { ...input, version: input.expectedVersion + 1, updatedByName: "Support", updatedAt: "2026-09-30T00:00:00Z" };
      return response({ context: saved.context });
    }
    return response({ profile: { ...profile, history: undefined }, orders: { items: profile.history, page: 1, total: 2, totalPages: 1 }, activeOrders: [], activity: { items: [], page: 1, total: 0, totalPages: 1 }, ...saved });
  });
});

describe("customer detail workflow", () => {
  it("shows actual delivered value separately from total recorded order value", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Rina" })).toBeInTheDocument();
    expect(screen.getByText("Delivered order value").parentElement).toHaveTextContent("৳500");
    expect(screen.getAllByText("৳1,400").length).toBeGreaterThan(0);
    expect(screen.getByText(/may include copied inbox orders/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call customer" })).toHaveAttribute("href", `tel:${phone}`);
    expect(await screen.findByText("Not checked yet")).toBeInTheDocument();
  });
  it("adds an authored note and keeps manual tags separate from calculated segments", async () => {
    const user = userEvent.setup(); renderPage();
    await screen.findByRole("heading", { name: "Rina" });
    await user.type(screen.getByLabelText("Internal note"), "Call after 6 pm");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    expect(await screen.findByText("Call after 6 pm")).toBeInTheDocument();
    expect(screen.getByText(/Support/)).toBeInTheDocument();
    expect(screen.getByLabelText("Internal note")).toHaveValue("");
    await user.type(screen.getByLabelText("Manual tags"), "Honey buyer, VIP");
    await user.click(screen.getByRole("button", { name: "Save customer context" }));
    await waitFor(() => expect(saved.context.tags).toEqual(["Honey buyer", "VIP"]));
    expect(saved.context.version).toBe(1);
  });
  it("preserves a failed note draft for retry", async () => {
    const user = userEvent.setup(); renderPage();
    await screen.findByRole("heading", { name: "Rina" });
    const original = vi.mocked(apiFetch).getMockImplementation()!;
    vi.mocked(apiFetch).mockImplementation((url, options) => options?.method === "POST" ? response({ error: "Could not save note" }, 500) : original(url, options));
    await user.type(screen.getByLabelText("Internal note"), "Call tomorrow");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    expect(await screen.findByText("Could not save note")).toBeInTheDocument();
    expect(screen.getByLabelText("Internal note")).toHaveValue("Call tomorrow");
  });
  it("offers reload after a stale context save without dropping the draft", async () => {
    const user = userEvent.setup(); renderPage();
    await screen.findByRole("heading", { name: "Rina" });
    const original = vi.mocked(apiFetch).getMockImplementation()!;
    vi.mocked(apiFetch).mockImplementation((url, options) => options?.method === "PATCH" ? response({ error: "Another staff member changed this profile" }, 409) : original(url, options));
    await user.type(screen.getByLabelText("Manual tags"), "Honey buyer");
    await user.click(screen.getByRole("button", { name: "Save customer context" }));
    expect(await screen.findByText("Another staff member changed this profile")).toBeInTheDocument();
    expect(screen.getByLabelText("Manual tags")).toHaveValue("Honey buyer");
    expect(screen.getByRole("button", { name: "Reload saved context" })).toBeInTheDocument();
  });
  it("creates a new order with the persisted customer identity and latest address", async () => {
    const user = userEvent.setup(); renderPage();
    await screen.findByRole("heading", { name: "Rina" });
    await user.click(screen.getByRole("link", { name: "Create order" }));
    expect(screen.getByTestId("location").textContent).toContain('"customerName":"Rina"');
    expect(screen.getByTestId("location").textContent).toContain('"address":"Dhaka"');
    expect(screen.getByTestId("location").textContent).toContain(`/customers/${phone}`);
  });
  it("shows an actionable API error and a retry control", async () => {
    vi.mocked(apiFetch).mockImplementation(() => response({ error: "Apply the customer migration" }, 503));
    renderPage();
    expect(await screen.findByText("Apply the customer migration")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
