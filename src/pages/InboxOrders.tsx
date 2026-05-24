import { useState, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import SteadfastLogo from "@/components/SteadfastLogo";
import PathaoLogo from "@/components/PathaoLogo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert, ShieldCheck,
  Truck, Search, NotebookPen, Package, Check, FileText, Trash2, Printer,
} from "lucide-react";
import {
  FacebookLogo, InstagramLogo, WhatsappLogo, ShoppingBag,
} from "@phosphor-icons/react";
import { generateInvoice, printInvoice } from "@/utils/invoiceGenerator";
import { Spinner } from "@/components/ui/ios-spinner";
import { AnimatedText } from "@/components/ui/animated-text";

interface InboxOrder {
  id: string;
  platform: "facebook" | "instagram" | "whatsapp";
  contact_name: string;
  contact_id: string;
  items: Array<{ product: string; quantity: number }>;
  notes: string;
  total_price: number;
  status: "pending" | "confirmed" | "cancelled";
  created_at: string;
  sent_to_courier?: boolean;
  consignment_id?: string;
  tracking_code?: string;
  courier_status?: string;
  courier_message?: string;
  fraud_checked?: boolean;
  fraud_data?: Record<string, unknown> | null;
  delivery_rate?: number | null;
}

function parseNotes(notes: string): { phone: string; address: string } {
  const phone = notes?.match(/Phone:\s*([^,\n]+)/i)?.[1]?.trim() || "";
  const address = notes?.match(/Address:\s*(.+)/i)?.[1]?.trim() || "";
  return { phone, address };
}

function itemsToProduct(items: InboxOrder["items"]): string {
  return (items || []).map((i) => `${i.quantity}x ${i.product}`).join(", ");
}

function toInvoiceOrder(o: InboxOrder) {
  const { phone, address } = parseNotes(o.notes);
  const items = o.items || [];
  const totalQty = items.reduce((a, i) => a + (i.quantity || 1), 0);
  return {
    id: o.id,
    order_number: `IO-${o.id.slice(-6).toUpperCase()}`,
    customer_name: o.contact_name || o.contact_id || "Customer",
    phone: phone || null,
    address: address || null,
    product: itemsToProduct(items),
    quantity: totalQty,
    price: o.total_price,
    status: o.status,
    created_at: o.created_at,
    delivery_rate: null,
    courier_status: o.courier_status || null,
    consignment_id: null,
    tracking_code: o.tracking_code || null,
    courier_message: o.courier_message || null,
  };
}

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  facebook: FacebookLogo,
  instagram: InstagramLogo,
  whatsapp: WhatsappLogo,
};
const PLATFORM_COLORS: Record<string, string> = {
  facebook: "text-[#1877F2]",
  instagram: "text-[#E1306C]",
  whatsapp: "text-[#25D366]",
};

// ─── FraudCell ────────────────────────────────────────────────────────────────

function InboxFraudCell({ order, isChecking, onCheck }: {
  order: InboxOrder;
  isChecking: boolean;
  onCheck: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const rawFraudData = order.fraud_data as (Record<string, unknown> & { _error?: string }) | null;
  const hasError = order.fraud_checked && (!rawFraudData || rawFraudData._error);

  let RiskIcon: typeof ShieldCheck = Search as typeof ShieldCheck;
  let riskColor = "text-muted-foreground/30";
  let riskBgColor = "";
  let riskLabel = "";
  let deliveryRate = 0;
  let total_parcels = 0, total_delivered = 0, total_cancel = 0;

  if (order.fraud_checked && !hasError && rawFraudData) {
    const fd = rawFraudData as { total_parcels: number; total_delivered: number; total_cancel: number };
    total_parcels = fd.total_parcels ?? 0;
    total_delivered = fd.total_delivered ?? 0;
    total_cancel = fd.total_cancel ?? 0;
    deliveryRate = total_parcels > 0 ? (total_delivered / total_parcels) * 100 : 0;

    if (total_parcels === 0) {
      RiskIcon = HelpCircle as typeof ShieldCheck;
      riskColor = "text-muted-foreground";
      riskBgColor = "bg-muted/50";
      riskLabel = "New Customer";
    } else if (deliveryRate >= 70) {
      RiskIcon = ShieldCheck;
      riskColor = "text-emerald-600";
      riskBgColor = "bg-emerald-50";
      riskLabel = "Safe";
    } else if (deliveryRate >= 50) {
      RiskIcon = AlertTriangle as typeof ShieldCheck;
      riskColor = "text-amber-600";
      riskBgColor = "bg-amber-50";
      riskLabel = "Caution";
    } else {
      RiskIcon = ShieldAlert as typeof ShieldCheck;
      riskColor = "text-red-600";
      riskBgColor = "bg-red-50";
      riskLabel = "High Risk";
    }
  }

  return (
    <div
      className="relative inline-flex items-center justify-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => { if (!isChecking && (!order.fraud_checked || hasError)) onCheck(); }}
        disabled={isChecking}
        className={cn(
          "flex flex-col items-center justify-center rounded-md transition-all outline-none",
          order.fraud_checked && !hasError
            ? cn("gap-0.5 px-1.5 py-1", riskBgColor)
            : "p-1.5 hover:bg-black/5 cursor-pointer",
          hasError && !isChecking && "hover:bg-red-50 cursor-pointer"
        )}
        data-testid={`button-fraud-check-inbox-${order.id}`}
      >
        {isChecking ? (
          <Spinner className="text-muted-foreground/40" />
        ) : hasError ? (
          <AlertTriangle className="h-3.5 w-3.5 text-destructive/60" />
        ) : order.fraud_checked ? (
          <>
            <RiskIcon className={cn("h-3.5 w-3.5", riskColor)} />
            <span className={cn("text-[10px] font-semibold tabular-nums", riskColor)}>
              {total_parcels > 0 ? `${deliveryRate.toFixed(0)}%` : "N/A"}
            </span>
          </>
        ) : (
          <Search className="h-3.5 w-3.5 text-muted-foreground/25" />
        )}
      </button>

      {hovered && order.fraud_checked && !isChecking && (
        <div className="absolute left-full top-0 ml-2 z-[200] w-72 bg-card border border-border shadow-xl rounded-xl overflow-hidden pointer-events-none">
          {hasError ? (
            <div className="p-4 space-y-2">
              <p className="text-[8px] font-medium tracking-[0.25em] text-black uppercase">FraudShield Error</p>
              <p className="text-sm font-semibold text-destructive">Check failed</p>
              <p className="text-xs text-muted-foreground break-words">
                {rawFraudData?._error ?? "API couldn't be reached."}
              </p>
              <p className="text-[9px] font-medium tracking-[0.2em] text-black uppercase pt-1 border-t border-black/[0.06]">Click icon to retry</p>
            </div>
          ) : (
            <>
              <div className={cn("px-4 py-3 border-b border-border/50", riskBgColor)}>
                <div className="flex items-center gap-2">
                  <RiskIcon className={cn("h-5 w-5", riskColor)} />
                  <span className={cn("font-semibold", riskColor)}>{riskLabel}</span>
                </div>
                {total_parcels > 0 && (
                  <p className="text-2xl font-bold mt-1 text-foreground">
                    {deliveryRate.toFixed(1)}%{" "}
                    <span className="text-sm font-normal text-muted-foreground">delivery rate</span>
                  </p>
                )}
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">{total_parcels}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-600">{total_delivered}</p>
                    <p className="text-xs text-muted-foreground">Delivered</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-600">{total_cancel}</p>
                    <p className="text-xs text-muted-foreground">Cancelled</p>
                  </div>
                </div>
                {total_parcels > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Delivery Success</span>
                      <span>{total_delivered}/{total_parcels}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${deliveryRate}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Notes Popover ────────────────────────────────────────────────────────────

function InboxNotesPopover({ order, onOrderUpdate }: {
  order: InboxOrder;
  onOrderUpdate: (updated: InboxOrder) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(order.notes || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/social/inbox-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error("Failed to save notes");
      const data = await res.json();
      if (data.order) onOrderUpdate(data.order);
      setOpen(false);
      toast.success("Notes saved");
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setSaving(false);
    }
  };

  const hasNotes = order.notes && order.notes.trim().length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              className={`relative p-1.5 rounded-lg transition-all duration-200 ${hasNotes
                ? "bg-gradient-to-br from-primary/15 to-primary/5 text-primary shadow-sm ring-1 ring-primary/20 hover:ring-primary/40 hover:shadow-md"
                : "text-muted-foreground/30 hover:bg-muted/50 hover:text-muted-foreground"
              }`}
            >
              <NotebookPen className="h-3.5 w-3.5" />
              {hasNotes && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        {!open && hasNotes && (
          <TooltipContent side="top" className="max-w-[200px] text-sm">{order.notes}</TooltipContent>
        )}
      </Tooltip>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Order Notes</p>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes..."
            className="min-h-[80px] text-sm resize-none"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Spinner size="sm" /> : "Save"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InboxOrders() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [sendingPathaoIds, setSendingPathaoIds] = useState<Set<string>>(new Set());
  const [checkingFraudIds, setCheckingFraudIds] = useState<Set<string>>(new Set());
  const [isBulkChecking, setIsBulkChecking] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [localOrders, setLocalOrders] = useState<InboxOrder[] | null>(null);

  const { data, isLoading } = useQuery<{ orders: InboxOrder[] }>({
    queryKey: ["/api/social/inbox-orders"],
    queryFn: () => apiFetch("/api/social/inbox-orders").then((r) => r.json()),
    refetchInterval: 15000,
  });

  const allOrders: InboxOrder[] = localOrders ?? data?.orders ?? [];

  const updateLocalOrder = (updated: InboxOrder) => {
    setLocalOrders((prev) => {
      const base = prev ?? data?.orders ?? [];
      return base.map((o) => (o.id === updated.id ? updated : o));
    });
  };

  const syncFromServer = () => {
    setLocalOrders(null);
    queryClient.invalidateQueries({ queryKey: ["/api/social/inbox-orders"] });
  };

  const filtered = useMemo(() => {
    let list = allOrders;
    if (statusFilter !== "all") list = list.filter((o) => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          (o.contact_name || "").toLowerCase().includes(q) ||
          (o.contact_id || "").toLowerCase().includes(q) ||
          (o.notes || "").toLowerCase().includes(q) ||
          (o.items || []).some((i) => i.product.toLowerCase().includes(q))
      );
    }
    return list;
  }, [allOrders, statusFilter, search]);

  const counts = useMemo(() => ({
    all: allOrders.length,
    pending: allOrders.filter((o) => o.status === "pending").length,
    confirmed: allOrders.filter((o) => o.status === "confirmed").length,
    cancelled: allOrders.filter((o) => o.status === "cancelled").length,
  }), [allOrders]);

  // ─── Status toggle ──────────────────────────────────────────────────────────
  const handleStatusUpdate = async (order: InboxOrder, newStatus: string) => {
    updateLocalOrder({ ...order, status: newStatus as InboxOrder["status"] });
    try {
      const res = await apiFetch(`/api/social/inbox-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.order) updateLocalOrder(data.order);
    } catch {
      updateLocalOrder(order); // revert
      toast.error("Failed to update status");
    }
  };

  // ─── Courier ────────────────────────────────────────────────────────────────
  const handleSendToCourier = async (order: InboxOrder) => {
    setSendingIds((prev) => new Set(prev).add(order.id));
    try {
      const res = await apiFetch("/api/inbox-orders/send-to-courier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to send to Steadfast");
      if (d.order) updateLocalOrder(d.order);
      toast.custom(() => (
        <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
          <div className="h-10 w-10 rounded-xl bg-black flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-black">Courier Dispatched</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-black">{order.contact_name || "Customer"}</span>
              <span className="text-xs text-black font-medium">Sent to Steadfast</span>
            </div>
          </div>
        </div>
      ));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Courier dispatch failed");
    } finally {
      setSendingIds((prev) => { const n = new Set(prev); n.delete(order.id); return n; });
    }
  };

  const handleSendToPathao = async (order: InboxOrder) => {
    setSendingPathaoIds((prev) => new Set(prev).add(order.id));
    try {
      const res = await apiFetch("/api/inbox-orders/send-to-pathao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to send to Pathao");
      if (d.order) updateLocalOrder(d.order);
      toast.custom(() => (
        <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
          <div className="h-10 w-10 rounded-xl bg-[#D82128] flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-black">Courier Dispatched</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-black">{order.contact_name || "Customer"}</span>
              <span className="text-xs text-black font-medium">Sent to Pathao</span>
            </div>
          </div>
        </div>
      ));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Pathao dispatch failed");
    } finally {
      setSendingPathaoIds((prev) => { const n = new Set(prev); n.delete(order.id); return n; });
    }
  };

  // ─── Fraud check ────────────────────────────────────────────────────────────
  const handleCheckFraud = async (order: InboxOrder) => {
    setCheckingFraudIds((prev) => new Set(prev).add(order.id));
    try {
      const res = await apiFetch("/api/inbox-orders/check-fraud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const d = await res.json();
      if (d.order) updateLocalOrder(d.order);
    } catch {
      toast.error("Fraud check failed");
    } finally {
      setCheckingFraudIds((prev) => { const n = new Set(prev); n.delete(order.id); return n; });
    }
  };

  const handleBulkFraudCheck = async () => {
    if (selectedIds.size === 0 || isBulkChecking) return;
    setIsBulkChecking(true);
    const ids = Array.from(selectedIds);
    let successCount = 0;
    try {
      for (const id of ids) {
        const order = allOrders.find((o) => o.id === id);
        if (!order) continue;
        setCheckingFraudIds((prev) => new Set(prev).add(id));
        try {
          const res = await apiFetch("/api/inbox-orders/check-fraud", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: id }),
          });
          const d = await res.json();
          if (d.order) { updateLocalOrder(d.order); successCount++; }
        } catch { /* ignore */ } finally {
          setCheckingFraudIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
        }
      }
      if (successCount > 0) {
        toast.custom(() => (
          <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-blue-500" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-widest text-black">Bulk Analysis</span>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-bold text-black">{successCount} Orders</span>
                <span className="text-xs text-black font-medium">Verified Successfully</span>
              </div>
            </div>
          </div>
        ));
      }
      setSelectedIds(new Set());
    } finally {
      setIsBulkChecking(false);
    }
  };

  // ─── Invoice ────────────────────────────────────────────────────────────────
  const handleGenerateInvoice = async () => {
    const selectedOrders = allOrders.filter((o) => selectedIds.has(o.id)).map(toInvoiceOrder);
    if (selectedOrders.length === 0) return;
    const toastId = toast.custom(() => (
      <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
        <div className="h-10 w-10 rounded-xl bg-black/[0.03] flex items-center justify-center shrink-0">
          <Spinner size="lg" className="text-black" />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-widest text-black">Processing</span>
          <span className="text-sm font-bold text-black">Generating Invoices...</span>
        </div>
      </div>
    ), { duration: Infinity });
    try {
      await new Promise((r) => setTimeout(r, 100));
      await generateInvoice(selectedOrders as Parameters<typeof generateInvoice>[0]);
      toast.dismiss(toastId);
      toast.custom(() => (
        <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
          <div className="h-10 w-10 rounded-xl bg-black flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-black">Complete</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-black">{selectedOrders.length} Invoices</span>
              <span className="text-xs text-black font-medium">Generated</span>
            </div>
          </div>
        </div>
      ));
    } catch {
      toast.dismiss(toastId);
      toast.error("Failed to generate invoice");
    }
  };

  const handlePrintInvoice = () => {
    const selectedOrders = allOrders.filter((o) => selectedIds.has(o.id)).map(toInvoiceOrder);
    if (selectedOrders.length === 0) return;
    try { printInvoice(selectedOrders as Parameters<typeof printInvoice>[0]); } catch { toast.error("Failed to print"); }
  };

  // ─── Delete ─────────────────────────────────────────────────────────────────
  const handleDeleteOrders = async () => {
    if (selectedIds.size === 0 || isDeleting) return;
    setIsDeleting(true);
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map((id) =>
        apiFetch(`/api/social/inbox-orders/${id}`, { method: "DELETE" })
      ));
      setLocalOrders((prev) => (prev ?? data?.orders ?? []).filter((o) => !ids.includes(o.id)));
      setSelectedIds(new Set());
      toast.custom(() => (
        <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
          <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-black">Deleted</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-black">{ids.length} Orders</span>
              <span className="text-xs text-black font-medium">Removed</span>
            </div>
          </div>
        </div>
      ));
    } catch {
      toast.error("Failed to delete orders");
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── Selection ──────────────────────────────────────────────────────────────
  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((o) => o.id)));
    }
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FAFAF8] p-1 lg:p-2">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-2xl border border-black/10 bg-white"
      >
        <div className="flex h-[50px] items-center justify-between border-b border-black/10 px-4 lg:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/[0.045] text-foreground">
              <ShoppingBag size={15} weight="light" />
            </span>
            <div>
              <AnimatedText as="p" className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Inbox Orders</AnimatedText>
              <p className="text-[11px] text-muted-foreground">Orders captured by AI from social conversations</p>
            </div>
          </div>
          <span className="rounded-full bg-black/[0.045] px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
            {filtered.length} shown
          </span>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-black/10 px-4 py-3 lg:flex-row lg:items-center lg:px-6">
        <div className="flex h-9 max-w-xs flex-1 items-center gap-2 rounded-xl border border-black/[0.08] bg-[#F8F8F6] px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, product..."
            className="flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
            data-testid="input-inbox-search"
          />
        </div>

        {/* Status filter tabs */}
        <div className="flex w-fit items-center rounded-xl border border-black/[0.08] bg-[#F8F8F6] p-1">
          {(["all", "pending", "confirmed", "cancelled"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[10px] font-semibold capitalize transition-colors",
                statusFilter === f ? "bg-black text-white" : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground"
              )}
              data-testid={`button-filter-${f}`}
            >
              {f} {counts[f as keyof typeof counts] > 0 && (
                <span className="ml-0.5 opacity-60">({counts[f as keyof typeof counts]})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-4 p-8">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-12 w-full rounded-2xl bg-black/[0.02]" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-black/[0.045]">
              <Package className="h-7 w-7 text-muted-foreground" />
            </span>
            <p className="text-sm font-semibold text-foreground">No orders found</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Try a different search or status filter.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-black/10 bg-[#F8F8F6] hover:bg-[#F8F8F6]">
                <TableHead className="w-10 py-3 pl-4 h-auto">
                  <div
                    onClick={toggleSelectAll}
                    className={cn(
                      "w-4 h-4 rounded border border-black/10 flex items-center justify-center cursor-pointer transition-all",
                      selectedIds.size === filtered.length && filtered.length > 0 ? "bg-black border-black" : "bg-white hover:border-black/30"
                    )}
                  >
                    {selectedIds.size === filtered.length && filtered.length > 0 && <Check className="w-3 h-3 text-white" />}
                  </div>
                </TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto">Source</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto">Customer</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto text-center">Trust</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto">Address</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto">Merchandise</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto text-right">Value</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto text-center">Status</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto text-center pr-4">Courier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((order) => {
                const PlatformIcon = PLATFORM_ICONS[order.platform] || ShoppingBag;
                const platColor = PLATFORM_COLORS[order.platform] || "text-black";
                const { phone, address } = parseNotes(order.notes);
                const items = order.items || [];
                const primaryItem = items[0] ? `${items[0].quantity}× ${items[0].product}` : "—";
                const moreCount = Math.max(0, items.length - 1);

                return (
                  <TableRow
                    key={order.id}
                    className={cn(
                      "border-b border-black/[0.02] hover:bg-black/[0.01] transition-colors group relative",
                      selectedIds.has(order.id) && "bg-black/[0.015]"
                    )}
                    data-testid={`row-inbox-order-${order.id}`}
                  >
                    {/* Checkbox */}
                    <TableCell className="w-10 py-3 pl-4">
                      <div
                        onClick={() => toggleSelect(order.id)}
                        className={cn(
                          "w-4 h-4 rounded border border-black/10 flex items-center justify-center cursor-pointer transition-all",
                          selectedIds.has(order.id) ? "bg-black border-black shadow-sm" : "bg-white group-hover:border-black/30"
                        )}
                      >
                        {selectedIds.has(order.id) && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </TableCell>

                    {/* Source: platform + date */}
                    <TableCell className="py-3">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <PlatformIcon size={11} weight="fill" className={platColor} />
                        <span className="text-[10px] font-semibold text-black uppercase tracking-wider capitalize">{order.platform}</span>
                      </div>
                      <span className="text-[9px] text-black font-medium uppercase tracking-wider">
                        {format(new Date(order.created_at), "MMM dd, yyyy")}
                      </span>
                    </TableCell>

                    {/* Customer */}
                    <TableCell className="max-w-[150px] py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-sm tracking-tight truncate">{order.contact_name || order.contact_id || "Unknown"}</span>
                        <span className="font-mono text-[11px] text-black">{phone || "No Phone"}</span>
                      </div>
                    </TableCell>

                    {/* Trust / FraudShield */}
                    <TableCell className="text-center py-3">
                      <div className="flex items-center justify-center">
                        <InboxFraudCell
                          order={order}
                          isChecking={checkingFraudIds.has(order.id)}
                          onCheck={() => handleCheckFraud(order)}
                        />
                      </div>
                    </TableCell>

                    {/* Address */}
                    <TableCell className="max-w-[150px] py-3">
                      <p className="text-xs text-black font-light truncate" title={address || ""}>
                        {address || "No address"}
                      </p>
                    </TableCell>

                    {/* Merchandise */}
                    <TableCell className="max-w-[160px] py-3">
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <div className="text-xs tracking-tight text-black truncate cursor-default">
                            <span className="font-medium">{primaryItem}</span>
                            {moreCount > 0 && (
                              <span className="ml-1.5 px-1 py-0.5 bg-black/5 rounded text-[9px] font-bold">+{moreCount}</span>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[360px] bg-black text-white border-none p-4 rounded-2xl shadow-2xl">
                          <div className="space-y-2">
                            {items.map((item, idx) => (
                              <p key={idx} className="text-xs font-light">{item.quantity}× {item.product}</p>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>

                    {/* Value */}
                    <TableCell className="text-right py-3 pr-4 tabular-nums">
                      <span className="font-medium text-sm">৳{(order.total_price || 0).toLocaleString()}</span>
                    </TableCell>

                    {/* Status + Notes */}
                    <TableCell className="text-center py-3">
                      <div className="flex items-center justify-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              className={cn(
                                "h-7 w-24 text-[9px] font-bold uppercase tracking-widest rounded-full transition-all border shadow-sm",
                                order.status === "confirmed"
                                  ? "bg-blue-50 border-blue-100 text-blue-600 shadow-blue-900/5"
                                  : order.status === "cancelled"
                                  ? "bg-red-50 border-red-100 text-red-500 shadow-red-900/5"
                                  : "bg-amber-50 border-amber-100 text-amber-600 shadow-amber-900/5"
                              )}
                              data-testid={`button-status-${order.id}`}
                            >
                              {order.status}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[140px] p-2 bg-white/95 backdrop-blur-xl border border-black/5 rounded-2xl shadow-2xl" align="center">
                            <div className="flex flex-col gap-1">
                              {["pending", "confirmed", "cancelled"].map((st) => (
                                <button
                                  key={st}
                                  onClick={() => { if (order.status !== st) handleStatusUpdate(order, st); }}
                                  className={cn(
                                    "h-8 w-full text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all text-left px-3",
                                    order.status === st ? "bg-black text-white" : "hover:bg-black/5 text-black"
                                  )}
                                >
                                  {st}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <InboxNotesPopover order={order} onOrderUpdate={updateLocalOrder} />
                      </div>
                    </TableCell>

                    {/* Courier */}
                    <TableCell className="text-center py-3 pr-4">
                      <div className="flex items-center justify-center">
                        {!order.sent_to_courier ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/[0.03] border border-black/5 hover:border-black/20 text-[9px] font-bold uppercase tracking-widest text-black hover:text-black transition-all">
                                <Truck className="h-3 w-3" />
                                Send
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[150px] p-2 bg-white border border-black/5 rounded-xl shadow-xl" align="center">
                              <div className="flex flex-col gap-1">
                                <button
                                  onClick={() => handleSendToCourier(order)}
                                  disabled={sendingIds.has(order.id)}
                                  className="flex items-center justify-center gap-2 h-8 w-full text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all hover:bg-blue-50 text-blue-600 disabled:opacity-50"
                                  data-testid={`button-steadfast-${order.id}`}
                                >
                                  {sendingIds.has(order.id) && <Spinner size="sm" />}
                                  <SteadfastLogo className="h-4 w-auto" />
                                </button>
                                <button
                                  onClick={() => handleSendToPathao(order)}
                                  disabled={sendingPathaoIds.has(order.id)}
                                  className="flex items-center justify-center gap-2 h-8 w-full text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all hover:bg-red-50 text-[#D82128] disabled:opacity-50"
                                  data-testid={`button-pathao-${order.id}`}
                                >
                                  {sendingPathaoIds.has(order.id) && <Spinner size="sm" />}
                                  <PathaoLogo className="h-5 w-auto" />
                                </button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-black/[0.03] border border-black/5 group-hover:border-black/10 transition-all">
                            <span className="text-[7px] font-bold uppercase tracking-[0.2em] text-black">REF</span>
                            <span className="text-[13px] font-mono font-bold text-black tracking-tight">{order.consignment_id}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
      </motion.div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100]"
          >
            <div className="bg-white border border-black/[0.09] shadow-[0_4px_40px_-8px_rgba(0,0,0,0.14)] flex items-stretch">
              <div className="flex flex-col justify-center px-6 py-3 border-r border-black/[0.06] min-w-[110px]">
                <span className="text-[7px] font-medium tracking-[0.3em] text-black uppercase">Selection</span>
                <span className="text-[22px] font-light tracking-tight text-black tabular-nums leading-none mt-0.5">
                  {selectedIds.size}
                  <span className="text-xs text-black font-normal ml-1">orders</span>
                </span>
              </div>
              <div className="flex items-center px-3 gap-0.5">
                <button
                  onClick={handleBulkFraudCheck}
                  disabled={isBulkChecking}
                  className="flex items-center gap-1.5 h-8 px-3 text-[9px] font-medium tracking-[0.18em] uppercase text-black hover:text-black hover:bg-black/[0.03] transition-all disabled:opacity-30"
                  data-testid="button-bulk-fraud-check-inbox"
                >
                  {isBulkChecking ? <Spinner size="sm" /> : <ShieldCheck className="h-3 w-3" />}
                  Fraud Check
                </button>
                <button
                  onClick={handleGenerateInvoice}
                  className="flex items-center gap-1.5 h-8 px-3 text-[9px] font-medium tracking-[0.18em] uppercase text-black hover:text-black hover:bg-black/[0.03] transition-all"
                  data-testid="button-generate-invoice-inbox"
                >
                  <FileText className="h-3 w-3" />
                  Invoice
                </button>
                <button
                  onClick={handlePrintInvoice}
                  className="flex items-center gap-1.5 h-8 px-3 text-[9px] font-medium tracking-[0.18em] uppercase text-black hover:text-black hover:bg-black/[0.03] transition-all"
                  data-testid="button-print-invoice-inbox"
                >
                  <Printer className="h-3 w-3" />
                  Print
                </button>
                <div className="w-px h-4 bg-black/[0.07] mx-1" />
                <button
                  onClick={handleDeleteOrders}
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 h-8 px-3 text-[9px] font-medium tracking-[0.18em] uppercase text-red-400 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-30"
                  data-testid="button-delete-inbox-orders"
                >
                  {isDeleting ? <Spinner size="sm" /> : <Trash2 className="h-3 w-3" />}
                  Delete
                </button>
                <div className="w-px h-4 bg-black/[0.07] mx-1" />
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="h-8 px-3 text-[9px] font-medium tracking-[0.18em] uppercase text-black hover:text-black transition-colors"
                  data-testid="button-clear-selection-inbox"
                >
                  Clear
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
