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
import { PopButton } from "@/components/ui/pop-button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import {
  MagnifyingGlass, ShoppingBag, Package, NotePencil, Truck,
  ShieldCheck, ShieldWarning, Warning, Question, FileText, Printer,
  Trash, Check, MapPin,
} from "@phosphor-icons/react";
import {
  FacebookLogo, InstagramLogo, WhatsappLogo,
} from "@phosphor-icons/react";
import { generateInvoice, printInvoice } from "@/utils/invoiceGenerator";
import { useOrgName } from "@/hooks/useOrgName";
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

// ─── Status helpers (matches Dashboard OrdersTable) ────────────────────────

function InboxOrderStatusIcon({ status }: { status: string }) {
  if (status === "confirmed") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
        <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21.897 6.63c.32.898-.13 1.513-.998 2.118c-.702.488-1.595 1.017-2.542 1.922c-.928.887-1.834 1.955-2.639 3.006a39 39 0 0 0-2.71 3.99a1.65 1.65 0 0 1-1.446.834a1.66 1.66 0 0 1-1.426-.873c-.748-1.363-1.326-1.901-1.592-2.094c-.737-.537-1.544-.63-1.544-1.8C7 12.776 7.746 12 8.667 12c.658.027 1.262.309 1.789.693c.342.249.705.578 1.082 1.012c.442-.654.975-1.408 1.573-2.189c.868-1.133 1.892-2.35 2.99-3.399c1.08-1.032 2.33-1.998 3.653-2.508c.863-.333 1.822.124 2.143 1.022M4.44 12.076a2.7 2.7 0 0 0-.6-.125l-.141-.006c-.938 0-1.699.783-1.699 1.748c0 .874.623 1.598 1.437 1.728q.042.02.137.087c.27.195.86.737 1.623 2.111c.298.538.851.873 1.453.88a1.67 1.67 0 0 0 1.112-.407M15 5.5c-1.35.515-2.622 1.489-3.723 2.53c-.384.363-.76.746-1.123 1.139" color="currentColor"/>
      </svg>
    );
  }
  if (status === "cancelled") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" opacity=".2" fill="currentColor" stroke="none"/>
        <path d="M15 9l-6 6M9 9l6 6"/>
      </svg>
    );
  }
  // pending
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
      <g fill="currentColor">
        <path d="M18.75 11a7 7 0 1 1-14 0a7 7 0 0 1 14 0Z" opacity=".2"/>
        <path fillRule="evenodd" d="M10 16a6 6 0 1 0 0-12a6 6 0 0 0 0 12Zm0 1a7 7 0 1 0 0-14a7 7 0 0 0 0 14Z" clipRule="evenodd"/>
        <path fillRule="evenodd" d="M10 6.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5Z" clipRule="evenodd"/>
        <path fillRule="evenodd" d="M13.5 10a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1h3a.5.5 0 0 1 .5.5Z" clipRule="evenodd"/>
      </g>
    </svg>
  );
}

function inboxStatusClasses(status: string, selected = false) {
  if (status === "confirmed") {
    return selected
      ? "border-emerald-200 bg-emerald-100 text-emerald-700"
      : "border-emerald-200/80 bg-emerald-50 text-emerald-700 shadow-emerald-950/5 hover:border-emerald-300 hover:bg-emerald-100";
  }
  if (status === "cancelled") {
    return selected
      ? "border-red-200 bg-red-100 text-red-600"
      : "border-red-200/80 bg-red-50 text-red-600 shadow-red-950/5 hover:border-red-300 hover:bg-red-100";
  }
  return selected
    ? "border-amber-200 bg-amber-100 text-amber-700"
    : "border-amber-200/80 bg-amber-50 text-amber-700 shadow-amber-950/5 hover:border-amber-300 hover:bg-amber-100";
}

// ─── Courier status badge (matches Dashboard getCourierStatusBadge) ─────────

function getInboxCourierBadge(order: InboxOrder) {
  if (!order.sent_to_courier) return null;
  const status = (order.courier_status || "").toLowerCase().trim();
  const stageConfig: Record<string, { label: string; color: React.ComponentProps<typeof PopButton>["color"] }> = {
    "":                                   { label: "Tracking ID",       color: "sky" },
    "pending":                            { label: "Pending",           color: "amber" },
    "in_review":                          { label: "In Review",         color: "amber" },
    "pickup requested":                   { label: "Pickup Requested",  color: "blue" },
    "pickup_requested":                   { label: "Pickup Requested",  color: "blue" },
    "processing":                         { label: "Processing",        color: "blue" },
    "picked up":                          { label: "Picked Up",         color: "blue" },
    "picked_up":                          { label: "Picked Up",         color: "blue" },
    "in transit":                         { label: "In Transit",        color: "indigo" },
    "in_transit":                         { label: "In Transit",        color: "indigo" },
    "dispatched":                         { label: "Out for Delivery",  color: "violet" },
    "on_the_way":                         { label: "Out for Delivery",  color: "violet" },
    "on the way":                         { label: "Out for Delivery",  color: "violet" },
    "assigned to rider":                  { label: "Out for Delivery",  color: "violet" },
    "assigned_to_rider":                  { label: "Out for Delivery",  color: "violet" },
    "out for delivery":                   { label: "Out for Delivery",  color: "violet" },
    "out_for_delivery":                   { label: "Out for Delivery",  color: "violet" },
    "ready for delivery":                 { label: "Out for Delivery",  color: "violet" },
    "ready_for_delivery":                 { label: "Out for Delivery",  color: "violet" },
    "hold":                               { label: "On Hold",           color: "orange" },
    "delivered":                          { label: "Delivered",         color: "green" },
    "partial_delivered":                  { label: "Part. Delivered",   color: "teal" },
    "delivered_approval_pending":         { label: "Approval Pending",  color: "cyan" },
    "partial_delivered_approval_pending": { label: "Partial Pending",   color: "cyan" },
    "cancelled_approval_pending":         { label: "Cancel Pending",    color: "red" },
    "returned":                           { label: "Returned",          color: "red" },
    "return_requested":                   { label: "Return Requested",  color: "red" },
    "cancelled":                          { label: "Cancelled",         color: "slate" },
    "unknown_approval_pending":           { label: "Unknown Pending",   color: "zinc" },
    "unknown":                            { label: "Unknown",           color: "zinc" },
  };
  const cfg = stageConfig[status] ?? { label: order.courier_status || "Tracking ID", color: "sky" as const };
  const hasRealStatus = status !== "" && status !== "pending" && status !== "in_review"
    && status !== "pickup_requested" && status !== "pickup requested";
  const id = order.consignment_id || order.tracking_code;

  if (!hasRealStatus) {
    return (
      <PopButton color="sky" size="sm" className="cursor-default gap-1.5 text-[10px] font-bold tracking-widest uppercase w-36 justify-center">
        <span className="opacity-70">ID</span>
        <span className="font-mono tracking-tight normal-case text-[11px]">{id || "—"}</span>
      </PopButton>
    );
  }
  return (
    <PopButton color={cfg.color} size="sm" className="cursor-default text-[9px] font-bold tracking-widest uppercase whitespace-nowrap w-36 justify-center">
      {cfg.label}
    </PopButton>
  );
}

// ─── FraudCell ────────────────────────────────────────────────────────────────

function InboxFraudCell({ order, isChecking, onCheck }: {
  order: InboxOrder;
  isChecking: boolean;
  onCheck: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const rawFraudData = order.fraud_data as (Record<string, unknown> & { _error?: string }) | null;
  const hasError = order.fraud_checked && (!rawFraudData || rawFraudData._error);

  let RiskIcon: React.ElementType = MagnifyingGlass;
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
      RiskIcon = Question;
      riskColor = "text-muted-foreground";
      riskBgColor = "bg-muted/50";
      riskLabel = "New Customer";
    } else if (deliveryRate >= 70) {
      RiskIcon = ShieldCheck;
      riskColor = "text-emerald-600";
      riskBgColor = "bg-emerald-50";
      riskLabel = "Safe";
    } else if (deliveryRate >= 50) {
      RiskIcon = Warning;
      riskColor = "text-amber-600";
      riskBgColor = "bg-amber-50";
      riskLabel = "Caution";
    } else {
      RiskIcon = ShieldWarning;
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
          <Warning size={14} weight="light" className="text-destructive/60" />
        ) : order.fraud_checked ? (
          <>
            <RiskIcon size={14} weight="light" className={cn("h-3.5 w-3.5", riskColor)} />
            <span className={cn("text-[10px] font-semibold tabular-nums", riskColor)}>
              {total_parcels > 0 ? `${deliveryRate.toFixed(0)}%` : "N/A"}
            </span>
          </>
        ) : (
          <MagnifyingGlass size={14} weight="light" className="text-muted-foreground/25" />
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
                  <RiskIcon size={20} weight="light" className={cn(riskColor)} />
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
              <NotePencil size={14} weight="light" />
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
  const { orgName } = useOrgName();
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
            <Truck size={20} weight="light" className="text-white" />
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
            <Truck size={20} weight="light" className="text-white" />
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
            <ShieldCheck size={20} weight="light" className="text-blue-500" />
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
      await generateInvoice(selectedOrders as Parameters<typeof generateInvoice>[0], orgName);
      toast.dismiss(toastId);
      toast.custom(() => (
        <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
          <div className="h-10 w-10 rounded-xl bg-black flex items-center justify-center shrink-0">
            <FileText size={20} weight="light" className="text-white" />
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
    try { printInvoice(selectedOrders as Parameters<typeof printInvoice>[0], orgName); } catch { toast.error("Failed to print"); }
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
            <Trash size={20} weight="light" className="text-red-500" />
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
          <MagnifyingGlass size={14} weight="light" className="shrink-0 text-muted-foreground" />
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
              <Package size={28} weight="light" className="text-muted-foreground" />
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
                    {selectedIds.size === filtered.length && filtered.length > 0 && <Check size={10} weight="bold" className="text-white" />}
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
                        {selectedIds.has(order.id) && <Check size={10} weight="bold" className="text-white" />}
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
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 group/addr cursor-default min-w-0">
                            <MapPin size={12} weight="light" className="shrink-0 text-blue-400 group-hover/addr:text-blue-500 transition-colors" />
                            <p className="text-xs text-black font-light truncate">
                              {address || "No address"}
                            </p>
                          </div>
                        </TooltipTrigger>
                        {address && (
                          <TooltipContent side="top" className="max-w-[260px] p-0 overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl shadow-black/10 backdrop-blur-xl">
                            <div className="border-b border-black/[0.06] px-3.5 py-2.5 flex items-center gap-2.5">
                              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shrink-0">
                                <MapPin size={14} weight="light" />
                              </span>
                              <div>
                                <p className="text-xs font-semibold text-foreground">Delivery Address</p>
                                <p className="text-[10px] text-muted-foreground">Ship to</p>
                              </div>
                            </div>
                            <div className="px-3.5 py-2.5">
                              <p className="text-xs text-foreground leading-relaxed">{address}</p>
                            </div>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TableCell>

                    {/* Merchandise */}
                    <TableCell className="max-w-[160px] py-3">
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 group/prod cursor-default min-w-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-blue-400 group-hover/prod:text-blue-500 transition-colors">
                              <g fill="none" stroke="currentColor" strokeWidth="1.2">
                                <rect width="14" height="17" x="5" y="4" fill="currentColor" fillOpacity=".25" rx="2"/>
                                <path strokeLinecap="round" d="M9 9h6m-6 4h6m-6 4h4"/>
                              </g>
                            </svg>
                            <div className="text-xs tracking-tight text-black truncate">
                              <span className="font-medium">{primaryItem}</span>
                              {moreCount > 0 && (
                                <span className="ml-1.5 px-1 py-0.5 bg-black/5 rounded text-[9px] font-bold">+{moreCount}</span>
                              )}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[300px] p-0 overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl shadow-black/10 backdrop-blur-xl">
                          <div className="border-b border-black/[0.06] px-3.5 py-2.5 flex items-center gap-2.5">
                            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-50 text-violet-600 shrink-0">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <g fill="none" stroke="currentColor" strokeWidth="1.2">
                                  <rect width="14" height="17" x="5" y="4" fill="currentColor" fillOpacity=".25" rx="2"/>
                                  <path strokeLinecap="round" d="M9 9h6m-6 4h6m-6 4h4"/>
                                </g>
                              </svg>
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-foreground">Order Items</p>
                              <p className="text-[10px] text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</p>
                            </div>
                          </div>
                          <div className="divide-y divide-black/[0.04]">
                            {items.length === 0 ? (
                              <p className="px-3.5 py-2.5 text-xs text-muted-foreground">No items</p>
                            ) : (
                              items.map((item, idx) => (
                                <div key={idx} className="px-3.5 py-2 flex items-start gap-2.5">
                                  <span className="mt-0.5 h-4 w-4 rounded-lg bg-black/[0.05] text-black/40 text-[9px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                                  <p className="text-xs text-foreground leading-relaxed">{item.quantity}× {item.product}</p>
                                </div>
                              ))
                            )}
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
                                "group/status status-pill relative inline-flex h-8 w-[112px] items-center overflow-hidden rounded-full border px-3 font-extrabold text-xs capitalize transition-all duration-200 active:scale-95",
                                inboxStatusClasses(order.status)
                              )}
                              data-testid={`button-status-${order.id}`}
                            >
                              <span className="status-pill-icon absolute left-3 top-1/2 z-10 flex -translate-y-1/2 items-center justify-center transition-all duration-500 ease-out group-hover/status:left-1/2 group-hover/status:-translate-x-1/2 group-hover/status:-translate-y-1/2 group-hover/status:scale-125">
                                <InboxOrderStatusIcon status={order.status} />
                              </span>
                              <span className="status-pill-label ml-6 whitespace-nowrap transition-all duration-500 ease-out group-hover/status:translate-x-[155%] group-hover/status:opacity-0">
                                {order.status}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[180px] rounded-2xl border border-black/10 bg-white/95 p-2 shadow-2xl shadow-black/10 backdrop-blur-xl" align="center">
                            <div className="flex flex-col gap-1">
                              {(["pending", "confirmed", "cancelled"] as const).map((st) => (
                                <button
                                  key={st}
                                  onClick={() => { if (order.status !== st) handleStatusUpdate(order, st); }}
                                  className={cn(
                                    "flex h-9 w-full items-center justify-between rounded-xl border px-3 text-left text-xs font-medium capitalize transition-all",
                                    order.status === st
                                      ? inboxStatusClasses(st, true)
                                      : "border-transparent text-foreground hover:border-black/10 hover:bg-black/[0.04]"
                                  )}
                                >
                                  <span className="flex items-center gap-2">
                                    <InboxOrderStatusIcon status={st} />
                                    {st}
                                  </span>
                                  {order.status === st && <Check size={14} weight="bold" />}
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
                              <button className="send-btn flex items-center rounded-xl bg-white border border-amber-500 text-amber-500 text-[11px] font-medium px-3 py-1.5 overflow-hidden transition-all duration-200 cursor-pointer active:scale-95 hover:bg-amber-50">
                                <div className="send-btn-svg-wrapper flex items-center">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={13} height={13} className="send-btn-icon transition-transform duration-300 origin-center">
                                    <path fill="none" d="M0 0h24v24H0z"/>
                                    <path fill="currentColor" d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z"/>
                                  </svg>
                                </div>
                                <span className="send-btn-label ml-1.5 transition-transform duration-300">Send</span>
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
                          getInboxCourierBadge(order)
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
                  {isBulkChecking ? <Spinner size="sm" /> : <ShieldCheck size={12} weight="light" />}
                  Fraud Check
                </button>
                <button
                  onClick={handleGenerateInvoice}
                  className="flex items-center gap-1.5 h-8 px-3 text-[9px] font-medium tracking-[0.18em] uppercase text-black hover:text-black hover:bg-black/[0.03] transition-all"
                  data-testid="button-generate-invoice-inbox"
                >
                  <FileText size={12} weight="light" />
                  Invoice
                </button>
                <button
                  onClick={handlePrintInvoice}
                  className="flex items-center gap-1.5 h-8 px-3 text-[9px] font-medium tracking-[0.18em] uppercase text-black hover:text-black hover:bg-black/[0.03] transition-all"
                  data-testid="button-print-invoice-inbox"
                >
                  <Printer size={12} weight="light" />
                  Print
                </button>
                <div className="w-px h-4 bg-black/[0.07] mx-1" />
                <button
                  onClick={handleDeleteOrders}
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 h-8 px-3 text-[9px] font-medium tracking-[0.18em] uppercase text-red-400 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-30"
                  data-testid="button-delete-inbox-orders"
                >
                  {isDeleting ? <Spinner size="sm" /> : <Trash size={12} weight="light" />}
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
