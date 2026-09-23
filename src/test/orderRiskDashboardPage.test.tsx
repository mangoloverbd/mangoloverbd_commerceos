import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import OrderProtection from "@/pages/OrderProtection";
import { fetchRiskAccuracy, fetchRiskAttempts, fetchRiskLists, updateRiskSettings } from "@/lib/orderRisk";

vi.mock("@/components/OrderProtectionReviewQueue", () => ({ OrderProtectionReviewQueue: () => <div>Held reviews</div> }));
vi.mock("@/lib/orderRisk", () => ({
  fetchRiskAttempts: vi.fn().mockResolvedValue({ attempts: [{ id: "attempt-1", created_at: "2026-09-23T00:00:00Z", decision: "HOLD", mode: "shadow", score: 40, customer_name: "Rahim", phone: "01712345678", topSignals: [{ code: "address_incomplete", label: "Address incomplete", severity: "medium", evidence: "More address detail needed" }], label: null }] }),
  fetchRiskAttempt: vi.fn().mockResolvedValue({ attempt: { id: "attempt-1", decision: "HOLD", mode: "shadow", score: 40, customer_name: "Rahim", phone: "01712345678", signals: [{ code: "address_incomplete", label: "Address incomplete", severity: "medium", evidence: "More address detail needed" }], reasons: ["score>=40"], context_trusted: true, items: [] }, related: [], order: null, review: null }),
  fetchRiskLists: vi.fn((list: "block" | "allow") => Promise.resolve({ entries: list === "block" ? [{ id: "list-1", list: "block", kind: "phone", display_hint: "Phone ending 5678", reason: "Repeated checkout attempts", created_at: "2026-09-23T00:00:00Z", expires_at: null }] : [] })),
  fetchRiskSettings: vi.fn().mockResolvedValue({ mode: "shadow", haterDistrictIds: ["15"], extraAbuseTerms: [], districtOptions: [{ id: "15", name: "Rajshahi" }] }),
  updateRiskSettings: vi.fn().mockResolvedValue({ mode: "shadow", haterDistrictIds: ["15"], extraAbuseTerms: [], districtOptions: [{ id: "15", name: "Rajshahi" }] }),
  fetchRiskAccuracy: vi.fn().mockResolvedValue({ overall: { attempts: 10, holds: 2, blocks: 1, holdRate: 0.2, blockPrecision: null, labelledFake: 0, labelledGenuine: 0, blockedGenuine: 0, heldGenuine: 0, fakeCaught: null, fakeSlipped: 0, targets: { blockPrecision: { value: null, target: 0.97, pass: null }, holdRate: { value: 0.2, target: 0.15, pass: false }, fakeCaught: { value: null, target: 0.7, pass: null } } }, signals: [] }),
  labelRiskAttempt: vi.fn().mockResolvedValue({ attempt: {} }),
  addRiskListEntry: vi.fn().mockResolvedValue({ entries: [] }),
  deleteRiskListEntry: vi.fn().mockResolvedValue({ success: true }),
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

it("renders report-style attempt summaries and investigation", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("tab", { name: "Attempts" }));
  expect(await screen.findByText("Loaded attempts")).toBeInTheDocument();
  expect(screen.getAllByText("Held").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Blocked").length).toBeGreaterThan(0);
  expect(screen.getByText("Average score")).toBeInTheDocument();

  await user.click(await screen.findByRole("button", { name: /Rahim.*40/ }));
  expect(await screen.findByText("Investigation")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark genuine" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark fake" })).toBeInTheDocument();
});

it("renders report-style list controls and entries", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("tab", { name: "Lists" }));
  expect(await screen.findByRole("button", { name: "Blocklist" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Allowlist" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByText("Phone ending 5678")).toBeInTheDocument();
  expect(screen.getByText(/Repeated checkout attempts/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
});

it("renders accuracy summary cards and range controls", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("tab", { name: "Accuracy" }));
  expect(await screen.findByText("Assessments")).toBeInTheDocument();
  expect(screen.getAllByText("Hold rate").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Block precision").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Fake caught").length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getAllByText("Not enough labels").length).toBeGreaterThan(0);
});

it("groups protection settings into labeled report sections", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("tab", { name: "Settings" }));
  expect((await screen.findAllByText("Protection mode")).length).toBeGreaterThan(0);
  expect(screen.getAllByText("Districts requiring review").length).toBeGreaterThan(0);
  expect(screen.getByText("Additional abuse terms")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save settings" })).toBeInTheDocument();
});

it("keeps the attempts decision filter connected to the risk API", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("tab", { name: "Attempts" }));
  await screen.findByRole("button", { name: /Rahim.*40/ });
  await user.selectOptions(screen.getByLabelText("Decision"), "hold");

  await waitFor(() => expect(fetchRiskAttempts).toHaveBeenLastCalledWith({ decision: "hold", before: undefined }));
});

it("switches lists and keeps the remove action wired", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("tab", { name: "Lists" }));
  await user.click(await screen.findByRole("button", { name: "Allowlist" }));
  await waitFor(() => expect(fetchRiskLists).toHaveBeenLastCalledWith("allow"));
  expect(await screen.findByText("No entries in this list.")).toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "Lists" }));
  await user.click(await screen.findByRole("button", { name: "Blocklist" }));
  await user.click(await screen.findByRole("button", { name: "Remove" }));
  await waitFor(() => expect(screen.queryByText("Phone ending 5678")).not.toBeInTheDocument());
});

it("keeps the accuracy range control connected to the risk API", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("tab", { name: "Accuracy" }));
  await user.click(await screen.findByRole("button", { name: "30 days" }));

  await waitFor(() => expect(fetchRiskAccuracy).toHaveBeenLastCalledWith(30));
  expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
});

it("saves settings and exposes the success status", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("tab", { name: "Settings" }));
  await user.click(await screen.findByRole("button", { name: "Save settings" }));

  await waitFor(() => expect(updateRiskSettings).toHaveBeenCalled());
  expect(await screen.findByRole("status")).toHaveTextContent("Settings saved");
});
