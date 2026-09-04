import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WAREHOUSES_QUERY_KEY, useWarehouses } from "@/hooks/useWarehouses";

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiFetch }));

const warehouse = {
  id: "warehouse-1",
  name: "Main warehouse",
  address: null,
  contact_person: null,
  phone: null,
  is_default: true,
  created_at: "2026-09-03T00:00:00.000Z",
  product_count: 3,
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useWarehouses", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("loads warehouses through the authenticated API and exposes the shared query key", async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ warehouses: [warehouse] }),
    });

    const { result } = renderHook(() => useWarehouses(), { wrapper });

    await waitFor(() => expect(result.current.warehouses).toEqual([warehouse]));
    expect(WAREHOUSES_QUERY_KEY).toBe("/api/warehouses");
    expect(apiFetch).toHaveBeenCalledWith("/api/warehouses");
  });
});
