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

  return useQuery<MeResponse>({
    queryKey: ["/api/me", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiFetch("/api/me");
      // Throw on 401 instead of returning null so callers can tell
      // "not yet authenticated / transient token expiry" apart from
      // "authenticated but workspace has no name".
      if (res.status === 401) throw new Error("Unauthorized");
      if (!res.ok) throw new Error("Failed to load user context");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === "Unauthorized") return false;
      return failureCount < 2;
    },
  });
}
