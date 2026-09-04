import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export const WAREHOUSES_QUERY_KEY = "/api/warehouses";

export type Warehouse = {
  id: string;
  name: string;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  is_default: boolean;
  created_at?: string;
  product_count?: number;
};

type WarehousesResponse = { warehouses: Warehouse[] };

export function useWarehouses() {
  const query = useQuery<WarehousesResponse>({
    queryKey: [WAREHOUSES_QUERY_KEY],
    queryFn: async () => {
      const response = await apiFetch(WAREHOUSES_QUERY_KEY);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Failed to load warehouses");
      return body;
    },
  });

  return {
    ...query,
    warehouses: query.data?.warehouses ?? [],
  };
}
