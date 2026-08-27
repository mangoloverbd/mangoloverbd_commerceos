import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { useLiveVisitors } from "@/hooks/useLiveVisitors";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe("useLiveVisitors", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns count and behavior details from the API", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse({ count: 7, details: { activeCarts: 2, checkingOut: 1, purchased: 3 } }),
    );

    const { result } = renderHook(() => useLiveVisitors());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.count).toBe(7);
    expect(result.current.details).toEqual({ activeCarts: 2, checkingOut: 1, purchased: 3 });
  });

  it("keeps zeros and still reports loaded when the request fails", async () => {
    mockApiFetch.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useLiveVisitors());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.count).toBe(0);
    expect(result.current.details).toEqual({ activeCarts: 0, checkingOut: 0, purchased: 0 });
  });

  it("polls every 5 seconds and clears the interval on unmount", () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ count: 0, details: {} }));
    const intervalSpy = vi.spyOn(window, "setInterval");
    const clearSpy = vi.spyOn(window, "clearInterval");

    const { unmount } = renderHook(() => useLiveVisitors());
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 5000);

    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
