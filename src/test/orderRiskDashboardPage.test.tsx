import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import OrderProtection from "@/pages/OrderProtection";
import { addRiskListEntry, fetchRiskAccuracy, fetchRiskAttempt, fetchRiskAttempts, fetchRiskLists, labelRiskAttempt, updateRiskSettings } from "@/lib/orderRisk";

vi.mock("@/components/OrderProtectionReviewQueue", () => ({ OrderProtectionReviewQueue: () => <div>Held reviews</div> }));
vi.mock("@/lib/orderRisk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orderRisk")>()),
  fetchRiskAttempts: vi.fn().mockResolvedValue({ attempts: [{ id: "attempt-1", created_at: "2026-09-23T00:00:00Z", decision: "HOLD", mode: "shadow", score: 40, customer_name: "Rahim", phone: "01712345678", ip_address: "203.0.113.24", order_id: "order-1", order_number: "ML-152777", topSignals: [{ code: "address_incomplete", label: "Address incomplete", severity: "medium", evidence: "More address detail needed" }], label: null }] }),
  fetchRiskSummary: vi.fn().mockResolvedValue({ days: 30, held: 2, blocked: 1, unlabelled: 6, fake: 0 }),
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
  await user.click(screen.getByRole("radio", { name: "Attempts" }));
  await user.click(await screen.findByRole("button", { name: /Rahim.*40/ }));
  expect(await screen.findByText("More address detail needed")).toBeInTheDocument();
  expect(screen.getByText("Shadow · not enforced")).toBeInTheDocument();
  expect(screen.queryByText(/phone_hash/)).not.toBeInTheDocument();
});

it("explains the deciding reason in plain words, not just signal chips", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);
  await user.click(screen.getByRole("radio", { name: "Attempts" }));
  await user.click(await screen.findByRole("button", { name: /Rahim.*40/ }));
  expect(await screen.findByText("High risk score (>=40)")).toBeInTheDocument();
});

it("keeps the held-review queue as the default view", () => {
  render(<OrderProtection />);
  expect(screen.getByText("Held reviews")).toBeInTheDocument();
});

it("supports arrow-key navigation across the order protection tabs", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  const reviews = screen.getByRole("radio", { name: "Reviews" });
  reviews.focus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("radio", { name: "Attempts" })).toHaveFocus();
  await user.keyboard(" ");

  expect(screen.getByRole("radio", { name: "Attempts" })).toHaveAttribute("aria-checked", "true");
});

it("reports unknown accuracy rather than calling unlabeled orders genuine", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);
  await user.click(screen.getByRole("radio", { name: "Accuracy" }));
  expect(await screen.findByText("20.0%" )).toBeInTheDocument();
  expect(screen.getAllByText("Not enough labels").length).toBeGreaterThan(0);
});

it("renders report-style attempt summaries and investigation", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("radio", { name: "Attempts" }));
  await waitFor(() => expect(screen.getByTestId("attempt-summary")).toHaveTextContent("Last 30 days · 2 held · 1 blocked · 6 not labelled · 0 marked fake"));

  // Full phone, order number and IP are visible on the row.
  expect(await screen.findByText("01712345678")).toBeInTheDocument();
  expect(screen.getByText(/ML-152777/)).toBeInTheDocument();
  expect(screen.getByText("IP 203.0.113.24")).toBeInTheDocument();

  await user.click(await screen.findByRole("button", { name: /Rahim.*40/ }));
  const drawer = await screen.findByRole("dialog", { name: "Investigation" });
  expect(drawer).toHaveTextContent("Rahim");
  expect(screen.getByRole("button", { name: "Genuine customer" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Fake order" })).toBeInTheDocument();

  // Closes from its close button and returns to the list.
  await user.click(screen.getByRole("button", { name: "Close investigation" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Investigation" })).not.toBeInTheDocument());
});

it("closes the investigation drawer with Escape", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("radio", { name: "Attempts" }));
  await user.click(await screen.findByRole("button", { name: /Rahim.*40/ }));
  await screen.findByRole("dialog", { name: "Investigation" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Investigation" })).not.toBeInTheDocument());
});

it("shows blocked and allowed lists inside Attempts instead of a separate tab", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  expect(screen.queryByRole("radio", { name: "Lists" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("radio", { name: "Attempts" }));
  await user.click(await screen.findByRole("button", { name: /Blocked & allowed/ }));
  expect(await screen.findByRole("button", { name: "Blocklist" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Allowlist" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByText("Phone ending 5678")).toBeInTheDocument();
  expect(screen.getByText(/Repeated checkout attempts/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
});

it("renders accuracy summary cards and range controls", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("radio", { name: "Accuracy" }));
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

  await user.click(screen.getByRole("radio", { name: "Settings" }));
  expect((await screen.findAllByText("Protection mode")).length).toBeGreaterThan(0);
  expect(screen.getAllByText("Districts requiring review").length).toBeGreaterThan(0);
  expect(screen.getByText("Additional abuse terms")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save settings" })).toBeInTheDocument();
});

it("keeps the attempts decision filter connected to the risk API", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("radio", { name: "Attempts" }));
  await screen.findByRole("button", { name: /Rahim.*40/ });
  await user.click(screen.getByRole("button", { name: "Held", pressed: false }));

  await waitFor(() => expect(fetchRiskAttempts).toHaveBeenLastCalledWith({ decision: "hold", before: undefined }));
});

it("searches attempts on the server by name, phone or order number", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("radio", { name: "Attempts" }));
  await screen.findByRole("button", { name: /Rahim.*40/ });
  await user.type(screen.getByRole("searchbox"), "ML-152777");

  await waitFor(() => expect(fetchRiskAttempts).toHaveBeenLastCalledWith({ decision: "all", before: undefined, q: "ML-152777" }));
});

it("marks an attempt fake straight from its row", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("radio", { name: "Attempts" }));
  await user.click(await screen.findByRole("button", { name: "Mark Rahim fake" }));

  await waitFor(() => expect(labelRiskAttempt).toHaveBeenCalledWith("attempt-1", "fake"));
  expect(await screen.findByRole("button", { name: "Mark Rahim fake" })).toHaveAttribute("aria-pressed", "true");
});

it("blocks a phone with a chosen reason instead of a browser prompt", async () => {
  const user = userEvent.setup();
  const prompt = vi.spyOn(window, "prompt");
  render(<OrderProtection />);

  await user.click(screen.getByRole("radio", { name: "Attempts" }));
  await user.click(await screen.findByRole("button", { name: "Block Rahim phone" }));
  await user.click(await screen.findByRole("button", { name: "Refused delivery" }));
  await user.type(screen.getByPlaceholderText(/3 orders refused/), "Refused twice");
  await user.click(screen.getByRole("button", { name: "Confirm block" }));

  await waitFor(() => expect(addRiskListEntry).toHaveBeenCalledWith("attempt-1", "block", ["phone"], "Refused delivery: Refused twice"));
  expect(prompt).not.toHaveBeenCalled();
  expect(await screen.findByRole("button", { name: "Block Rahim phone" })).toHaveTextContent("Phone blocked");
});

it("switches lists and keeps the remove action wired", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("radio", { name: "Attempts" }));
  await user.click(await screen.findByRole("button", { name: /Blocked & allowed/ }));
  await user.click(await screen.findByRole("button", { name: "Allowlist" }));
  await waitFor(() => expect(fetchRiskLists).toHaveBeenLastCalledWith("allow"));
  expect(await screen.findByText("No entries in this list.")).toBeInTheDocument();

  await user.click(await screen.findByRole("button", { name: "Blocklist" }));
  await user.click(await screen.findByRole("button", { name: "Remove" }));
  await waitFor(() => expect(screen.queryByText("Phone ending 5678")).not.toBeInTheDocument());
});

it("keeps the accuracy range control connected to the risk API", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("radio", { name: "Accuracy" }));
  await user.click(await screen.findByRole("button", { name: "30 days" }));

  await waitFor(() => expect(fetchRiskAccuracy).toHaveBeenLastCalledWith(30));
  expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
});

it("saves settings and exposes the success status", async () => {
  const user = userEvent.setup();
  render(<OrderProtection />);

  await user.click(screen.getByRole("radio", { name: "Settings" }));
  await user.click(await screen.findByRole("button", { name: "Save settings" }));

  await waitFor(() => expect(updateRiskSettings).toHaveBeenCalled());
  expect(await screen.findByRole("status")).toHaveTextContent("Settings saved");
});

it("shows the newly clicked attempt immediately instead of the previous one", async () => {
  const user = userEvent.setup();
  const base = (await vi.mocked(fetchRiskAttempts)()).attempts[0];
  vi.mocked(fetchRiskAttempts).mockResolvedValue({ attempts: [base, { ...base, id: "attempt-2", customer_name: "Karim", phone: "01811111111", order_number: "ML-152700" }] });
  render(<OrderProtection />);

  await user.click(screen.getByRole("radio", { name: "Attempts" }));
  await user.click(await screen.findByRole("button", { name: /Rahim.*40/ }));
  expect(await screen.findByRole("dialog", { name: "Investigation" })).toHaveTextContent("Rahim");
  await user.click(screen.getByRole("button", { name: "Close investigation" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  // Karim's details never arrive in this test; the drawer must still show Karim, not Rahim.
  vi.mocked(fetchRiskAttempt).mockImplementationOnce(() => new Promise(() => {}));
  await user.click(screen.getByRole("button", { name: /Karim.*40/ }));
  const drawer = await screen.findByRole("dialog", { name: "Investigation" });
  expect(drawer).toHaveTextContent("Karim");
  expect(drawer).toHaveTextContent("01811111111");
  expect(drawer).not.toHaveTextContent("Rahim");
  expect(screen.getByRole("status", { name: "Loading attempt details" })).toBeInTheDocument();
});
