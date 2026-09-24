import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
let intervalCallback: (() => void) | null = null;

vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/useVisibleInterval", () => ({
  useVisibleInterval: (callback: () => void) => {
    intervalCallback = callback;
  },
}));

import { useSidebarAlerts } from "@/hooks/useSidebarAlerts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const alert = {
  id: "o1",
  type: "stale_pending",
  order_number: "ML-1",
  customer_name: "Rahim",
  created_at: "2026-09-01T00:00:00Z",
  daysOld: 5,
};
const aiInsights = { stalePending: { headline: "1 pending order", insight: "Call Rahim." } };

describe("useSidebarAlerts", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    intervalCallback = null;
  });

  it("never falls back to the full /api/orders list and keeps previous alerts on failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    apiFetch.mockResolvedValueOnce(jsonResponse({ alerts: [alert], aiInsights }));
    const { result } = renderHook(() => useSidebarAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));

    apiFetch.mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500));
    await act(async () => {
      intervalCallback?.();
    });

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(apiFetch.mock.calls.map((call) => call[0])).toEqual(["/api/sidebar-alerts", "/api/sidebar-alerts"]);
    expect(result.current.alerts).toEqual([alert]);
    expect(result.current.aiInsights).toEqual(aiInsights);
    expect(result.current.loading).toBe(false);
    consoleError.mockRestore();
  });

  it("does not request /api/orders when the first load fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    apiFetch.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useSidebarAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch.mock.calls[0][0]).toBe("/api/sidebar-alerts");
    expect(result.current.alerts).toEqual([]);
    consoleError.mockRestore();
  });
});
