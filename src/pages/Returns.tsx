import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/ios-spinner";
import { CartoonButton } from "@/components/ui/cartoon-button";
import { RichButton } from "@/components/ui/rich-button";
import { Button } from "@/components/base/buttons/button";
import { RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Package, ArrowUUpLeft } from "@phosphor-icons/react";
import SteadfastLogo from "@/components/SteadfastLogo";
import PathaoLogo from "@/components/PathaoLogo";
import { format } from "date-fns";
import { AnimatedText } from "@/components/ui/animated-text";
import { TextEffect } from "@/components/ui/text-effect";

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

function ReturnsMetric({
  label,
  value,
  subValue,
  valueClassName = "text-black",
  subValueClassName = "text-black/30",
  sparklineValues = [],
  loading = false,
}: {
  label: string;
  value: string;
  subValue?: string;
  valueClassName?: string;
  subValueClassName?: string;
  sparklineValues?: number[];
  loading?: boolean;
}) {
  return (
    <div
      style={{
        background: "#F5F5F5",
        borderRadius: "14px",
        padding: "3px",
        border: "1.5px solid rgba(0,0,0,0.07)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.7)",
      }}
      className="min-w-0"
    >
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              background: "#F7F7F6",
              borderRadius: "10px",
              padding: "9px 12px",
            }}
            className="space-y-2"
          >
            <div className="h-2.5 w-16 animate-pulse rounded" style={{ background: "rgba(0,0,0,0.06)" }} />
            <div className="h-5 w-20 animate-pulse rounded" style={{ background: "rgba(0,0,0,0.06)" }} />
            <div className="h-3 w-24 animate-pulse rounded" style={{ background: "rgba(0,0,0,0.06)" }} />
          </motion.div>
        ) : (
          <motion.div
            key="value"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div
              style={{
                background: "#F7F7F6",
                borderRadius: "10px",
                border: "1px solid rgba(0,0,0,0.05)",
                padding: "9px 12px",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.06)",
              }}
            >
              <p
                style={{
                  fontSize: "10px",
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  color: "#7F7F7D",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                {label}
              </p>

              <div className="mt-1.5 flex items-end justify-between">
                <TextEffect
                  as="p"
                  per="char"
                  delay={0.12}
                  className={`m-0 text-[20px] font-bold leading-none tabular-nums ${valueClassName}`}
                >
                  {value}
                </TextEffect>
                {sparklineValues.length > 0 && (
                  <div className="flex items-end shrink-0" style={{ gap: "4px", height: "24px" }}>
                    {sparklineValues.slice(-7).map((v, i) => {
                      const isActive = i === sparklineValues.length - 1;
                      const max = Math.max(...sparklineValues.slice(-7), 1);
                      const height = Math.max(10, (v / max) * 100);
                      return (
                        <div
                          key={i}
                          className="rounded-full"
                          style={{
                            width: isActive ? "4px" : "3px",
                            height: `${height}%`,
                            backgroundColor: isActive ? "#232323" : "#BFBFBC",
                            opacity: isActive ? 1 : 0.4,
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {subValue && (
                <p className="mt-1.5 text-[10px] font-medium text-black/40">
                  {subValue}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReturnStatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  if (s === "pending") return <span className="inline-flex items-center rounded-lg bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700">Pending</span>;
  if (s === "approved" || s === "processing") return <span className="inline-flex items-center rounded-lg bg-blue-50 border border-blue-200/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-700">Processing</span>;
  if (s === "completed" || s === "returned") return <span className="inline-flex items-center rounded-lg bg-red-50 border border-red-200/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-red-600">Returned</span>;
  if (s === "cancelled") return <span className="inline-flex items-center rounded-lg bg-black/[0.05] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-black/40">Cancelled</span>;
  return <span className="inline-flex items-center rounded-lg bg-black/[0.05] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-black/40">{status || "Unknown"}</span>;
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
    } catch (err: unknown) {
      toast.error(err?.message || "Return request failed");
    } finally {
      setRequestingId(null);
    }
  };

  return (
    <div className="space-y-3 p-1 lg:p-2">
      {/* ─ Returns Panel ───────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative rounded-2xl bg-[#F3F3F3]"
      >
        {/* Header row */}
        <div className="flex items-center justify-between pt-3 pb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
              <ArrowUUpLeft size={14} weight="light" />
            </span>
            <div>
              <AnimatedText as="p" className="font-sf-display text-[14px] font-semibold tracking-normal text-foreground">Returns</AnimatedText>
              <p className="text-[10px] text-muted-foreground">Manage courier returns and cancellations</p>
            </div>
          </div>
          <RichButton
            color="default"
            size="sm"
            onClick={async () => { await handleBackfillFees(); await handleSync(); }}
            disabled={syncing}
          >
            {syncing ? <Spinner size="sm" className="mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            {syncing ? "Syncing..." : "Sync"}
          </RichButton>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 pb-3">
          <ReturnsMetric
            label="Lost Revenue"
            value={isLoading ? "—" : `৳${summary.totalLostRevenue.toLocaleString()}`}
            subValue={isLoading ? "Loading..." : `${summary.total} orders lost`}
            loading={isLoading}
          />
          <ReturnsMetric
            label="Courier Fees Lost"
            value={isLoading ? "—" : `৳${summary.totalCourierFeesLost.toLocaleString()}`}
            subValue={isLoading ? "Loading..." : `${summary.total} fees`}
            loading={isLoading}
          />
          <ReturnsMetric
            label="Return Rate"
            value={isLoading ? "—" : `${summary.total}`}
            valueClassName="text-red-600"
            subValue={isLoading ? "Loading..." : `${summary.pending} pending · ${summary.processing} processing`}
            loading={isLoading}
          />
        </div>
      </motion.div>

      {/* ── Returns table card ────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="overflow-hidden rounded-xl border border-black/10 bg-white"
      >
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 border-b border-black/10 px-3 py-2">
          <div className="flex w-fit items-center rounded-lg border border-black/[0.08] bg-[#F8F8F6] p-0.5">
            {(["all", "pending", "processing", "completed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[9px] font-semibold capitalize transition-colors",
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
            <div className="flex items-center justify-center py-16">
              <Spinner className="h-5 w-5 text-black/30" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-black/[0.045]">
                <Package size={24} weight="light" className="text-muted-foreground" />
              </span>
              <p className="text-[13px] font-semibold text-foreground">No returns found</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Returns will appear here when orders are returned or cancelled by courier.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-black/10 bg-[#F8F8F6]">
                  <th className="text-left text-[10px] font-bold uppercase tracking-[0.15em] text-black py-2.5 px-4">Order</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-[0.15em] text-black py-2.5">Customer</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-[0.15em] text-black py-2.5">Product</th>
                  <th className="text-right text-[10px] font-bold uppercase tracking-[0.15em] text-black py-2.5">COD</th>
                  <th className="text-center text-[10px] font-bold uppercase tracking-[0.15em] text-black py-2.5">Courier</th>
                  <th className="text-center text-[10px] font-bold uppercase tracking-[0.15em] text-black py-2.5">Status</th>
                  <th className="text-right text-[10px] font-bold uppercase tracking-[0.15em] text-black py-2.5">Fee Lost</th>
                  <th className="text-right text-[10px] font-bold uppercase tracking-[0.15em] text-black py-2.5 pr-4">Date</th>
                  <th className="text-center text-[10px] font-bold uppercase tracking-[0.15em] text-black py-2.5 pr-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id} className="border-b border-black/[0.04] hover:bg-black/[0.01] transition-colors">
                    <td className="py-2.5 px-4">
                      <span className="text-[12px] font-medium text-black">{order.order_number}</span>
                      <span className="ml-1.5 text-[9px] text-black/30 uppercase">{order.source}</span>
                    </td>
                    <td className="py-2.5">
                      <p className="text-[12px] font-medium text-black truncate max-w-[120px]">{order.customer_name}</p>
                      <p className="text-[10px] text-black/40 font-mono">{order.phone || "—"}</p>
                    </td>
                    <td className="py-2.5 max-w-[180px]">
                      <p className="text-[11px] text-black truncate">{order.product || "—"}</p>
                    </td>
                    <td className="py-2.5 text-right">
                      <span className="text-[12px] font-medium text-black tabular-nums">৳{(order.cod_amount || 0).toLocaleString()}</span>
                    </td>
                    <td className="py-2.5 text-center">
                      <div className="flex items-center justify-center">
                        <CourierBadge name={order.courier_name} />
                      </div>
                    </td>
                    <td className="py-2.5 text-center">
                      <ReturnStatusBadge status={order.return_status} />
                    </td>
                    <td className="py-2.5 text-right">
                      <span className="text-[12px] font-medium text-red-600 tabular-nums">
                        {order.courier_fee ? `৳${order.courier_fee.toLocaleString()}` : "—"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right pr-4">
                      <span className="text-[10px] text-black/40">
                        {order.return_requested_at
                          ? format(new Date(order.return_requested_at), "MMM dd")
                          : format(new Date(order.created_at), "MMM dd")}
                      </span>
                    </td>
                    <td className="py-2.5 text-center pr-4">
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
