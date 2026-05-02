import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export function useOrgName() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<string>({
    queryKey: ["/api/settings/org_name"],
    queryFn: async () => {
      const res = await apiFetch("/api/settings");
      if (!res.ok) return "";
      const { settings } = await res.json();
      return settings?.org_name ?? "";
    },
    staleTime: 1000 * 60 * 5,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/settings/org_name"] });

  return { orgName: data ?? "", isLoading, refresh };
}
