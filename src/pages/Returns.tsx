import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/ios-spinner";
import { RichButton } from "@/components/ui/rich-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowCounterClockwise, Package, ArrowUUpLeft } from "@phosphor-icons/react";
import SteadfastLogo from "@/components/SteadfastLogo";
import PathaoLogo from "@/components/PathaoLogo";
import { format } from "date-fns";
import { AnimatedText } from "@/components/ui/animated-text";

interface ReturnOrder {
  id: string;
  source: "shopify" | "inbox";
  order_number: string;
  customer_name: string;
  phone: string;
  product: string;
  cod_amount: number;
  courier_name: string;
  courier_status: string;
  courier_fee: number | null;
  consignment_id: string;
  return_status: string;
  return_reason: string;
  return_requested_at: string | null;
  created_at: string;
}

interface ReturnsSummary {
  total: number;
  totalLostRevenue: number;
  totalCourierFeesLost: number;
  pending: number;
  processing: number;
  completed: number;
}

type FilterTab = "all" | "pending" | "processing" | "completed";

function ReturnStatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  if (s === "pending") return <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700">Pending</span>;
  if (s === "approved" || s === "processing") return <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-700">Processing</span>;
  if (s === "completed" || s === "returned") return <span className="inline-flex items-center rounded-full bg-red-50 border border-red-200/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-red-600">Returned</span>;
  if (s === "cancelled") return <span className="inline-flex items-center rounded-full bg-black/[0.05] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-black/40">Cancelled</span>;
  return <span className="inline-flex items-center rounded-full bg-black/[0.05] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-black/40">{status || "Unknown"}</span>;
}

function CourierBadge({ name }: { name: string }) {
  const n = (name || "").toLowerCase();
  if (n === "steadfast") return <SteadfastLogo className="h-4 w-auto" />;
  if (n === "pathao") return <PathaoLogo className="h-5 w-auto" />;
  return <span className="text-[10px] text-black/40 uppercase">{name || "—"}</span>;
}

export default function Returns() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [syncing, setSyncing] = useState(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery<{ returns: ReturnOrder[]; summary: ReturnsSummary }>({
    queryKey: ["/api/returns"],
    queryFn: () => apiFetch("/api/returns").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const returns = data?.returns || [];
  const summary = data?.summary || { total: 0, totalLostRevenue: 0, totalCourierFeesLost: 0, pending: 0, processing: 0, completed: 0 };

  const filtered = returns.filter((r) => {
    if (filter === "all") return true;
    if (filter === "pending") return r.return_status === "pending";
    if (filter === "processing") return ["approved", "processing"].includes(r.return_status);
    if (filter === "completed") return ["completed", "returned"].includes(r.return_status);
    return true;
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await apiFetch("/api/returns/sync");
      const d = await res.json();
      toast.success(`Synced ${d.synced || 0} return statuses`);
      queryClient.invalidateQueries({ queryKey: ["/api/returns"] });
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleBackfillFees = async () => {
    setSyncing(true);
    try {
      const res = await apiFetch("/api/returns/backfill-fees", { method: "POST" });
      const d = await res.json();
      toast.success(`Updated ${d.updated || 0} orders with courier fees`);
      queryClient.invalidateQueries({ queryKey: ["/api/returns"] });
    } catch {
      toast.error("Backfill failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleRequestReturn = async (order: ReturnOrder) => {
    setRequestingId(order.id);
    try {
      const res = await apiFetch("/api/returns/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, source: order.source, reason }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success("Return requested successfully");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/returns"] });
    } catch (err: any) {
      toast.error(err?.message || "Return request failed");
    } finally {
      setRequestingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] p-1 lg:p-2">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-black/10 bg-white"
      >
        {/* Header */}
        <div className="flex h-[50px] items-center justify-between border-b border-black/10 px-4 lg:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
              <ArrowUUpLeft size={15} weight="light" />
            </span>
            <div>
              <AnimatedText as="p" className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Returns</AnimatedText>
              <p className="text-[11px] text-muted-foreground">Manage courier returns and cancellations</p>
            </div>
          </div>
          <RichButton onClick={async () => { await handleBackfillFees(); await handleSync(); }} disabled={syncing} size="sm" color="default">
            {syncing ? <Spinner size="sm" /> : <ArrowCounterClockwise size={12} weight="light" />}
            Sync
          </RichButton>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 border-b border-black/10 px-4 py-4 lg:px-6">
          <div className="rounded-[14px] border border-black/[0.08] bg-[#FAFAF8] p-4">
            <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-black/40">Lost Revenue</p>
            <p className="mt-1 text-[22px] font-light text-black tabular-nums">৳{summary.totalLostRevenue.toLocaleString()}</p>
          </div>
          <div className="rounded-[14px] border border-black/[0.08] bg-[#FAFAF8] p-4">
            <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-black/40">Courier Fees Lost</p>
            <p className="mt-1 text-[22px] font-light text-black tabular-nums">৳{summary.totalCourierFeesLost.toLocaleString()}</p>
          </div>
          <div className="rounded-[14px] border border-black/[0.08] bg-[#FAFAF8] p-4">
            <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-black/40">Return Rate</p>
            <p className="mt-1 text-[22px] font-light text-red-600 tabular-nums">{summary.total}</p>
            <p className="text-[10px] text-black/30 mt-0.5">{summary.pending} pending · {summary.processing} processing</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 border-b border-black/10 px-4 py-2 lg:px-6">
          <div className="flex w-fit items-center rounded-xl border border-black/[0.08] bg-[#F8F8F6] p-1">
            {(["all", "pending", "processing", "completed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[10px] font-semibold capitalize transition-colors",
                  filter === f ? "bg-black text-white" : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner className="h-5 w-5 text-black/30" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-black/[0.045]">
                <Package size={28} weight="light" className="text-muted-foreground" />
              </span>
              <p className="text-sm font-semibold text-foreground">No returns found</p>
              <p className="mt-1 text-[12px] text-muted-foreground">Returns will appear here when orders are returned or cancelled by courier.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-black/10 bg-[#F8F8F6]">
                  <th className="text-left text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 px-4">Order</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3">Customer</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3">Product</th>
                  <th className="text-right text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3">COD</th>
                  <th className="text-center text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3">Courier</th>
                  <th className="text-center text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3">Status</th>
                  <th className="text-right text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3">Fee Lost</th>
                  <th className="text-right text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 pr-4">Date</th>
                  <th className="text-center text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 pr-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id} className="border-b border-black/[0.04] hover:bg-black/[0.01] transition-colors">
                    <td className="py-3 px-4">
                      <span className="text-[12px] font-medium text-black">{order.order_number}</span>
                      <span className="ml-1.5 text-[9px] text-black/30 uppercase">{order.source}</span>
                    </td>
                    <td className="py-3">
                      <p className="text-[12px] font-medium text-black truncate max-w-[120px]">{order.customer_name}</p>
                      <p className="text-[10px] text-black/40 font-mono">{order.phone || "—"}</p>
                    </td>
                    <td className="py-3 max-w-[180px]">
                      <p className="text-[11px] text-black truncate">{order.product || "—"}</p>
                    </td>
                    <td className="py-3 text-right">
                      <span className="text-[12px] font-medium text-black tabular-nums">৳{(order.cod_amount || 0).toLocaleString()}</span>
                    </td>
                    <td className="py-3 text-center">
                      <div className="flex items-center justify-center">
                        <CourierBadge name={order.courier_name} />
                      </div>
                    </td>
                    <td className="py-3 text-center">
                      <ReturnStatusBadge status={order.return_status} />
                    </td>
                    <td className="py-3 text-right">
                      <span className="text-[12px] font-medium text-red-600 tabular-nums">
                        {order.courier_fee ? `৳${order.courier_fee.toLocaleString()}` : "—"}
                      </span>
                    </td>
                    <td className="py-3 text-right pr-4">
                      <span className="text-[10px] text-black/40">
                        {order.return_requested_at
                          ? format(new Date(order.return_requested_at), "MMM dd")
                          : format(new Date(order.created_at), "MMM dd")}
                      </span>
                    </td>
                    <td className="py-3 text-center pr-4">
                      {!order.return_status || order.return_status === "cancelled" ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="text-[10px] font-medium text-red-500 hover:text-red-700 transition-colors underline underline-offset-2">
                              Request Return
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-3 bg-white border border-black/[0.08] rounded-xl shadow-xl" align="end">
                            <div className="space-y-3">
                              <p className="text-[11px] font-medium text-black">Return Reason (optional)</p>
                              <input
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="e.g. Customer refused delivery"
                                className="w-full h-8 rounded-lg border border-black/[0.1] bg-black/[0.02] px-3 text-[12px] text-black outline-none focus:ring-1 focus:ring-black/10"
                              />
                              <RichButton
                                onClick={() => handleRequestReturn(order)}
                                disabled={requestingId === order.id}
                                size="sm"
                                color="default"
                                className="w-full"
                              >
                                {requestingId === order.id ? <Spinner size="sm" /> : "Submit Return Request"}
                              </RichButton>
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <span className="text-[10px] text-black/30">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </div>
  );
}
