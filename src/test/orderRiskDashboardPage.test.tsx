import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import OrderProtection from "@/pages/OrderProtection";

vi.mock("@/components/OrderProtectionReviewQueue", () => ({ OrderProtectionReviewQueue: () => <div>Held reviews</div> }));
vi.mock("@/lib/orderRisk", () => ({
  fetchRiskAttempts: vi.fn().mockResolvedValue({ attempts: [{ id: "attempt-1", created_at: "2026-09-23T00:00:00Z", decision: "HOLD", mode: "shadow", score: 40, customer_name: "Rahim", phone: "01712345678", topSignals: [{ code: "address_incomplete", label: "Address incomplete", severity: "medium", evidence: "More address detail needed" }], label: null }] }),
  fetchRiskAttempt: vi.fn().mockResolvedValue({ attempt: { id: "attempt-1", decision: "HOLD", mode: "shadow", score: 40, customer_name: "Rahim", phone: "01712345678", signals: [{ code: "address_incomplete", label: "Address incomplete", severity: "medium", evidence: "More address detail needed" }], reasons: ["score>=40"], context_trusted: true, items: [] }, related: [], order: null, review: null }),
  fetchRiskLists: vi.fn().mockResolvedValue({ entries: [] }),
  fetchRiskSettings: vi.fn().mockResolvedValue({ mode: "shadow", haterDistrictIds: ["15"], extraAbuseTerms: [], districtOptions: [{ id: "15", name: "Rajshahi" }] }),
  fetchRiskAccuracy: vi.fn().mockResolvedValue({ overall: { attempts: 10, holds: 2, blocks: 1, holdRate: 0.2, blockPrecision: null, labelledFake: 0, labelledGenuine: 0, blockedGenuine: 0, heldGenuine: 0, fakeCaught: null, fakeSlipped: 0, targets: { blockPrecision: { value: null, target: 0.97, pass: null }, holdRate: { value: 0.2, target: 0.15, pass: false }, fakeCaught: { value: null, target: 0.7, pass: null } } }, signals: [] }),
}));

it("shows a shadow attempt's evidence without exposing hashed identifiers", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);
  await user.click(screen.getByRole("tab", { name: "Attempts" }));
  await user.click(await screen.findByRole("button", { name: /Rahim.*40/ }));
  expect(await screen.findByText("More address detail needed")).toBeInTheDocument();
  expect(screen.getByText("Shadow · not enforced")).toBeInTheDocument();
  expect(screen.queryByText(/phone_hash/)).not.toBeInTheDocument();
});

it("explains the deciding reason in plain words, not just signal chips", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);
  await user.click(screen.getByRole("tab", { name: "Attempts" }));
  await user.click(await screen.findByRole("button", { name: /Rahim.*40/ }));
  expect(await screen.findByText("High risk score (>=40)")).toBeInTheDocument();
});

it("keeps the held-review queue as the default view", () => {
  render(<OrderProtection />);
  expect(screen.getByText("Held reviews")).toBeInTheDocument();
});

it("reports unknown accuracy rather than calling unlabeled orders genuine", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);
  await user.click(screen.getByRole("tab", { name: "Accuracy" }));
  expect(await screen.findByText("20.0%" )).toBeInTheDocument();
  expect(screen.getAllByText("Not enough labels").length).toBeGreaterThan(0);
});
