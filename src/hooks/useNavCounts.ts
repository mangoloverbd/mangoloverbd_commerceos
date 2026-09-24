import { useQuery, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type NavCounts = { order_protection_held: number; returns_pending: number };

export const NAV_COUNTS_QUERY_KEY = ["/api/nav/counts"] as const;

// Sidebar badges: one tiny head-count request every 2 minutes and on tab focus.
export function useNavCounts() {
  return useQuery<NavCounts>({
    queryKey: NAV_COUNTS_QUERY_KEY,
    queryFn: async () => {
      const response = await apiFetch("/api/nav/counts");
      if (!response.ok) throw new Error("Failed to load sidebar counts");
      return response.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function refreshNavCounts(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: NAV_COUNTS_QUERY_KEY });
}
