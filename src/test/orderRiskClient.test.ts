import { expect, it, vi } from "vitest";
import { fetchRiskAttempts, fetchRiskAttempt, fetchRiskLists, fetchRiskSettings } from "../lib/orderRisk";
import { apiFetch } from "../lib/api";

vi.mock("../lib/api", () => ({ apiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ attempts: [], entries: [], mode: "shadow" }) }) }));

it("uses authenticated API requests for risk resources", async () => {
  await fetchRiskAttempts({ decision: "hold", limit: 20 });
  await fetchRiskAttempt("a");
  await fetchRiskLists("block");
  await fetchRiskSettings();
  expect(apiFetch).toHaveBeenCalledWith("/api/order-protection/attempts?decision=hold&limit=20");
  expect(apiFetch).toHaveBeenCalledWith("/api/order-protection/attempts/a");
  expect(apiFetch).toHaveBeenCalledWith("/api/order-protection/lists?list=block");
  expect(apiFetch).toHaveBeenCalledWith("/api/order-protection/settings");
});
