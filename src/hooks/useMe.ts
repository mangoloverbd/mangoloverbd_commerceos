import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export type AppRole = "admin" | "team_member";

export type MeResponse = {
  user: {
    id: string;
    email: string;
  };
  role: AppRole | null;
  orgId: string | null;
  orgName: string;
  isAdmin: boolean;
  isTeamMember: boolean;
  hasRole: boolean;
};

export function useMe() {
  const { user } = useAuth();

  return useQuery<MeResponse | null>({
    queryKey: ["/api/me", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiFetch("/api/me");
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to load user context");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });
}
