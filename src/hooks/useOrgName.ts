import { useQueryClient } from "@tanstack/react-query";
import { useMe } from "@/hooks/useMe";

export function useOrgName() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useMe();

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/me"] });

  return { orgName: data?.orgName ?? "", isLoading, refresh };
}
