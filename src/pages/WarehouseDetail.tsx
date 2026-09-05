import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Buildings,
  MapPin,
  Package,
  PencilSimple,
  Plus,
  Trash,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { Plus as PlusIcon, Search, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { OrdersTable, type Order } from "@/components/OrdersTable";
import { OrderStatusSegmentedControl } from "@/components/orders/OrderStatusSegmentedControl";
import { WarehouseDialog } from "@/components/WarehouseDialog";
import { WarehouseMetric } from "@/components/warehouse/WarehouseMetric";
import { AddProductsDialog } from "@/components/warehouse/AddProductsDialog";
import { Chip } from "@/components/base/badges/chip";
import OrderCreatorModal from "@/components/OrderCreatorModal";
import { RichButton } from "@/components/ui/rich-button";
import { PopButton } from "@/components/ui/pop-button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/ios-spinner";
import { toast, DarkToast } from "@/components/ui/sonner";
import { WAREHOUSES_QUERY_KEY, type Warehouse } from "@/hooks/useWarehouses";
import {
  countOrdersByStatus,
  filterOrdersByStatus,
  type OrderStatusFilter,
} from "@/lib/orderStatusFilters";

const SYS = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif";
const headClass = "h-11 px-4 text-left text-[11px] font-medium uppercase tracking-wider text-black/45";

type Product = {
  id: string;
  name: string;
  selling_price: number | null;
  stock_quantity: number | null;
  weight_kg: number | null;
  published: boolean;
  assigned_explicitly: boolean;
};

type Detail = {
  warehouse: Warehouse;
  summary: { product_count: number; total_stock: number; published_count: number };
  products: Product[];
};

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return new Error(typeof body?.error === "string" ? body.error : fallback);
}

export default function WarehouseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>("all");
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [checkingFraud, setCheckingFraud] = useState(false);

  const detail = useQuery<Detail>({
    queryKey: ["warehouse", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const response = await apiFetch(`/api/warehouses/${id}`);
      if (!response.ok) throw await responseError(response, "Failed to load warehouse");
      return response.json();
    },
  });

  const orders = useQuery<{ orders: Order[] }>({
    queryKey: ["warehouse-orders", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const response = await apiFetch(`/api/orders?warehouse_id=${encodeURIComponent(id!)}`);
      if (!response.ok) throw await responseError(response, "Failed to load warehouse orders");
      const body = await response.json();
      return Array.isArray(body) ? { orders: body } : body;
    },
  });

  async function checkFraud() {
    setCheckingFraud(true);
    try {
      const response = await apiFetch("/api/check-fraud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json();
      if (!response.ok) throw await responseError(response, "Fraud check failed");
      await orders.refetch();
      toast.custom(() => (
        <DarkToast className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
            <ShieldCheck className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-white">{body?.successful ?? 0} verified</p>
            <p className="text-[11px] text-white/50">of {body?.checked ?? 0} checked</p>
          </div>
        </DarkToast>
      ), { fit: true });
    } catch {
      toast.error("Fraud check failed");
    } finally {
      setCheckingFraud(false);
    }
  }

  const warehouseOrders = useMemo(
    () => orders.data?.orders ?? [],
    [orders.data?.orders],
  );
  const orderStatusCounts = useMemo(
    () => countOrdersByStatus(warehouseOrders),
    [warehouseOrders],
  );

  const filteredWarehouseOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = filterOrdersByStatus(warehouseOrders, statusFilter);
    if (!query) return list;
    return list.filter((order) =>
      order.order_number.toLowerCase().includes(query) ||
      (order.customer_name && order.customer_name.toLowerCase().includes(query)) ||
      (order.phone && order.phone.toLowerCase().includes(query)),
    );
  }, [search, statusFilter, warehouseOrders]);

  async function removeProduct(product: Product) {
    setRemovingId(product.id);
    try {
      const response = await apiFetch("/api/products/bulk-assign-warehouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: [product.id], warehouse_id: null }),
      });
      if (!response.ok) throw await responseError(response, "Failed to remove product");
      await detail.refetch();
      toast.success(`${product.name} moved to the default warehouse`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove product");
    } finally {
      setRemovingId(null);
    }
  }

  if (detail.isLoading) {
    return <main className="grid min-h-[55vh] place-items-center bg-white" aria-label="Loading warehouse"><Spinner size="lg" className="text-black/35" /></main>;
  }

  if (detail.isError || !detail.data) {
    return (
      <main className="grid min-h-[55vh] place-items-center bg-white px-6 text-center" style={{ fontFamily: SYS }}>
        <div>
          <WarningCircle size={34} weight="light" className="mx-auto text-black/25" />
          <h1 className="mt-3 text-[15px] font-semibold text-black">Warehouse not found</h1>
          <p className="mt-1 text-[12px] text-black/40">This location may have been removed or is temporarily unavailable.</p>
          <button type="button" onClick={() => navigate("/warehouses")} className="mt-4 text-[12px] font-medium text-black/55 underline underline-offset-4">Back to warehouses</button>
        </div>
      </main>
    );
  }

  const data = detail.data;

  return (
    <div className="min-h-full" style={{ fontFamily: SYS }}>
      <div className="min-h-full space-y-5 bg-white p-1 lg:p-2">
        <motion.header initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.3 }} className="rounded-2xl bg-black/[0.025] px-5 py-5 sm:px-6">
          <button type="button" aria-label="Back to warehouses" onClick={() => navigate("/warehouses")} className="mb-5 inline-flex items-center gap-1.5 rounded-lg py-1 text-[12px] font-medium text-black/45 transition-colors hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15">
            <ArrowLeft size={15} weight="light" /> Warehouses
          </button>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-black text-white"><Buildings size={23} weight="light" /></span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-[24px] font-semibold tracking-tight text-black">{data.warehouse.name}</h1>
                  <Chip variant="bold" color={data.warehouse.is_default ? "lime" : "cyan"} className="gap-1.5">
                    <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${data.warehouse.is_default ? "bg-status-lime-text" : "bg-status-cyan-text"}`} />
                    {data.warehouse.is_default ? "Default" : "Active"}
                  </Chip>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-black/45">
                  <span className="inline-flex items-center gap-1.5"><MapPin size={13} weight="light" />{data.warehouse.address || "No address added"}</span>
                  <span className="inline-flex items-center gap-1.5"><UserCircle size={13} weight="light" />{data.warehouse.contact_person || "No contact person"}</span>
                  {data.warehouse.phone ? <span>{data.warehouse.phone}</span> : null}
                </div>
              </div>
            </div>
            <RichButton type="button" onClick={() => setEditOpen(true)} className="h-9 self-start rounded-xl px-3 text-[11px]">
              <PencilSimple size={14} weight="light" /> Edit warehouse
            </RichButton>
          </div>
        </motion.header>

        <motion.section initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 0.05 }} className="grid gap-4 sm:grid-cols-3">
          <WarehouseMetric label="Products assigned" value={data.summary.product_count} detail="Including default fallback" />
          <WarehouseMetric label="Units in stock" value={data.summary.total_stock} detail="Across assigned products" />
          <WarehouseMetric label="Published" value={data.summary.published_count} detail={`${Math.max(data.summary.product_count - data.summary.published_count, 0)} draft products`} />
        </motion.section>

        <motion.section initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 0.1 }} className="overflow-hidden rounded-2xl bg-white">
          <div className="flex items-center gap-2 border-b border-[color:var(--color-separator-border)] px-5 py-4">
            <Package size={17} weight="light" className="text-black/60" />
            <h2 className="text-[14px] font-semibold text-black">Inventory at this warehouse</h2>
            <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-black/60">{data.products.length}</span>
            <span className="flex-1" />
            <RichButton type="button" onClick={() => setAddOpen(true)} aria-label="Add products" className="h-8 rounded-lg px-2.5 text-[11px]">
              <Plus size={14} weight="light" /> Add products
            </RichButton>
          </div>
          {data.products.length === 0 ? (
            <div className="py-20 text-center"><Package size={30} weight="light" className="mx-auto text-black/20" /><p className="mt-3 text-[13px] font-semibold text-black">No products assigned</p><p className="mt-1 text-[12px] text-black/40">Assign products from the Products page.</p></div>
          ) : (
            <div data-testid="warehouse-products-table" className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead><tr className="border-y border-[color:var(--color-separator-border)] bg-background-secondary-default"><th className={headClass}>Product</th><th className={headClass}>Assignment</th><th className={`${headClass} text-center`}>Weight</th><th className={`${headClass} text-center`}>Stock</th><th className={`${headClass} text-center`}>Publication</th><th className={`${headClass} text-right`}>Actions</th></tr></thead>
                <tbody>
                  {data.products.map((product) => (
                    <tr key={product.id} className="border-b border-[color:var(--color-separator-border)] transition-colors hover:bg-background-secondary-default">
                      <td className="px-4 py-3.5"><p className="text-[13px] font-semibold text-black">{product.name}</p><p className="mt-0.5 text-[11px] text-black/40">{product.selling_price == null ? "Price not set" : `৳${product.selling_price.toLocaleString()}`}</p></td>
                      <td className="px-4 py-3.5"><Chip variant="caption" color={product.assigned_explicitly ? "blue" : "yellow"} className="gap-1.5"><span className={`h-[5px] w-[5px] shrink-0 rounded-full ${product.assigned_explicitly ? "bg-status-blue-text" : "bg-status-yellow-text"}`} />{product.assigned_explicitly ? "Direct assignment" : "Default fallback"}</Chip></td>
                      <td className="px-4 py-3.5 text-center text-[12px] text-black/55">{product.weight_kg == null ? "No weight" : `${product.weight_kg} kg`}</td>
                      <td className="px-4 py-3.5 text-center"><span className="text-[13px] font-semibold tabular-nums text-black">{product.stock_quantity ?? 0}</span><p className="text-[10px] text-black/35">units</p></td>
                      <td className="px-4 py-3.5 text-center"><Chip variant="caption" color={product.published ? "lime" : "gray"} className="gap-1.5"><span className={`h-[5px] w-[5px] shrink-0 rounded-full ${product.published ? "bg-status-lime-text" : "bg-background-tertiary-default"}`} />{product.published ? "Published" : "Draft"}</Chip></td>
                      <td className="px-4 py-3.5 text-right">
                        {product.assigned_explicitly ? <button type="button" aria-label={`Remove ${product.name} from warehouse`} disabled={removingId === product.id} onClick={() => void removeProduct(product)} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-wait disabled:opacity-40">{removingId === product.id ? <Spinner size="sm" /> : <Trash size={14} weight="light" />} Remove</button> : <span className="text-[10px] text-black/30">Managed by default</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.section>

        <motion.section initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 0.15 }} className="overflow-hidden rounded-2xl bg-white">
          <div className="flex flex-col gap-3 border-b border-[color:var(--color-separator-border)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2.5">
              <p className="font-sf-display text-[18px] font-bold tracking-tight text-foreground">{data.warehouse.name}</p>
              <div className="h-3.5 w-px bg-black/10" />
              {orders.isLoading ? (
                <span className="text-[13px] tabular-nums text-muted-foreground">—</span>
              ) : (
                <span className="text-[13px] tabular-nums text-muted-foreground">{`${filteredWarehouseOrders.length} orders`}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search orders…"
                  aria-label="Search warehouse orders"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-9 w-56 rounded-xl border-0 bg-black/[0.06] pl-8 text-sm shadow-none placeholder:text-black/35 focus-visible:ring-1 focus-visible:ring-black/20"
                  data-testid="input-search-warehouse-orders"
                />
              </div>
              <div className="h-4 w-px bg-black/10" />
              <PopButton
                color="yellow"
                size="sm"
                onClick={() => setCreateOrderOpen(true)}
                className="gap-1.5 px-3 text-[11px] font-bold tracking-normal text-black"
                data-testid="button-create-warehouse-order"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Create Order
              </PopButton>
              <PopButton
                color="sky"
                size="sm"
                onClick={() => void checkFraud()}
                disabled={checkingFraud}
                className="gap-1.5 px-3 text-[11px] font-bold tracking-normal"
                data-testid="button-verify-warehouse-orders"
              >
                {checkingFraud ? <Spinner size="sm" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Verify All
              </PopButton>
            </div>
          </div>
          <OrderStatusSegmentedControl
            counts={orderStatusCounts}
            value={statusFilter}
            loading={orders.isLoading}
            onChange={setStatusFilter}
          />
          {orders.isError ? <div className="py-16 text-center"><WarningCircle size={28} weight="light" className="mx-auto text-black/20" /><p className="mt-2 text-[12px] text-black/45">Couldn’t load warehouse orders.</p><button type="button" onClick={() => void orders.refetch()} className="mt-3 text-[12px] font-medium underline underline-offset-4">Try again</button></div> : <OrdersTable orders={filteredWarehouseOrders} loading={orders.isLoading} onStatusUpdate={() => void orders.refetch()} onOrderUpdate={() => void orders.refetch()} />}
        </motion.section>
      </div>

      <WarehouseDialog open={editOpen} warehouse={data.warehouse} onClose={() => setEditOpen(false)} onSaved={async () => {
        await Promise.all([detail.refetch(), queryClient.invalidateQueries({ queryKey: [WAREHOUSES_QUERY_KEY] })]);
      }} />
      <AddProductsDialog
        open={addOpen}
        warehouseId={data.warehouse.id}
        warehouseName={data.warehouse.name}
        onClose={() => setAddOpen(false)}
        onAssigned={async () => {
          await Promise.all([detail.refetch(), queryClient.invalidateQueries({ queryKey: [WAREHOUSES_QUERY_KEY] })]);
        }}
      />
      <OrderCreatorModal
        open={createOrderOpen}
        onOpenChange={setCreateOrderOpen}
        onCreated={() => {
          void orders.refetch();
        }}
      />
    </div>
  );
}
