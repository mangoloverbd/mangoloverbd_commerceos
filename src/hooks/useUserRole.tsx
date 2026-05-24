import { useMe } from "@/hooks/useMe";

export function useUserRole() {
  const { data, isLoading } = useMe();
  const role = data?.role ?? null;

  const isAdmin = role === "admin";
  const isTeamMember = role === "team_member";

  return { role, isAdmin, isTeamMember, loading: isLoading };
}
