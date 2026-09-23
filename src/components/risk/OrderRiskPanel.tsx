import { useQuery } from "@tanstack/react-query";
import { RiskDetails } from "@/components/risk/RiskDashboard";
import { fetchOrderRisk } from "@/lib/orderRisk";

export function OrderRiskPanel({ orderId }: { orderId: string }) {
  const { data, isPending, error } = useQuery({ queryKey: ["order-risk", orderId], queryFn: () => fetchOrderRisk(orderId), staleTime: 30_000 });
  if (isPending) return <p className="p-4 text-sm">Loading risk assessment…</p>;
  if (error) return <p role="alert" className="p-4 text-sm">Could not load risk assessment.</p>;
  if (!data?.attempt) return <p className="p-4 text-sm text-black/55">No risk assessment was recorded for this order.</p>;
  return <div className="bg-white p-4"><RiskDetails attempt={data.attempt} /></div>;
}
