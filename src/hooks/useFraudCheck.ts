import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { normalizeBdPhone } from "@/lib/bdPhone";

export type FraudLookup = {
  phone: string;
  status: "ok" | "error" | "pending" | null;
  payload?: Record<string, unknown> | null;
  summary?: Record<string, number | string> | null;
  checkedAt?: string | null;
  errorMessage?: string | null;
  spentRequest?: boolean;
};

function lookupKey(phone: string | null) {
  return ["/api/fraud/lookup", phone] as const;
}

// Cache-only. Deliberately a GET so that opening an order editor never spends
// a FraudShield request.
export function useFraudLookup(phone: string | null | undefined) {
  const normalized = normalizeBdPhone(phone);
  return useQuery<FraudLookup>({
    queryKey: lookupKey(normalized),
    enabled: Boolean(normalized),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await apiFetch(`/api/fraud/lookup?phone=${normalized}`);
      if (!res.ok) throw new Error("Could not read fraud data");
      return res.json();
    },
  });
}

export function useFraudCheckMutation(phone: string | null | undefined) {
  const normalized = normalizeBdPhone(phone);
  const queryClient = useQueryClient();

  return useMutation<FraudLookup, Error, { force?: boolean } | void>({
    mutationFn: async (variables) => {
      const res = await apiFetch("/api/fraud/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized, force: variables?.force === true }),
      });
      if (!res.ok) throw new Error("Fraud check failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(lookupKey(normalized), data);
    },
  });
}
