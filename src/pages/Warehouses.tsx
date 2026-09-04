import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Buildings, MagnifyingGlass, MapPin, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { RichButton } from "@/components/ui/rich-button";
import { WarehouseDialog } from "@/components/WarehouseDialog";
import { useWarehouses, type Warehouse } from "@/hooks/useWarehouses";

function Stat({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="min-h-[92px] rounded-2xl bg-black/[0.04] px-5 py-3"
    >
      <p className="text-[8px] font-medium tracking-[0.3em] text-black/45 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{value}</p>
      <p className="mt-0.5 text-[11px] text-black/40">{sub}</p>
    </motion.div>
  );
}

const thClass = "py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-black";

export default function Warehouses() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { warehouses, isLoading, isError, refetch } = useWarehouses();
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredWarehouses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return warehouses;
    return warehouses.filter((warehouse) => [warehouse.name, warehouse.address, warehouse.contact_person, warehouse.phone]
      .some((value) => value?.toLowerCase().includes(query)));
  }, [search, warehouses]);

  const assignedProducts = useMemo(() => warehouses.reduce((sum, warehouse) => sum + (warehouse.product_count ?? 0), 0), [warehouses]);
  const defaultWarehouse = warehouses.find((warehouse) => warehouse.is_default);
  const contactReady = warehouses.filter((warehouse) => warehouse.contact_person || warehouse.phone).length;

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(warehouse: Warehouse) {
    setEditing(warehouse);
    setDialogOpen(true);
  }

  async function remove(warehouse: Warehouse) {
    if (warehouse.is_default) {
      toast.error("Cannot delete the default warehouse");
      return;
    }
    if (!window.confirm(`Delete ${warehouse.name}? Products assigned to it will move to the default warehouse.`)) return;
    setDeletingId(warehouse.id);
    try {
      const response = await apiFetch(`/api/warehouses/${warehouse.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Failed to delete warehouse");
      await refetch();
      toast.success("Warehouse deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete warehouse");
    } finally {
      setDeletingId(null);
    }
  }

  function navigateToWarehouse(warehouse: Warehouse) {
    navigate(`/warehouses/${warehouse.id}`);
  }

  return (
    <div className="min-h-full space-y-6 bg-white p-1 lg:p-2">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative space-y-4"
      >
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-sf-display text-[22px] font-bold tracking-tight text-black">Warehouses</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-black/45">Inventory locations routing products and orders.</p>
          </div>
          <RichButton type="button" onClick={openCreate} className="h-9 shrink-0 rounded-xl bg-black px-3 text-[11px] font-semibold text-white hover:bg-black">
            <Plus size={14} weight="light" /> New Warehouse
          </RichButton>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Warehouses" value={warehouses.length} sub="Active locations" />
          <Stat label="Assigned" value={assignedProducts} sub="Products across locations" />
          <Stat label="Default" value={defaultWarehouse ? "1" : "—"} sub={defaultWarehouse?.name ?? "Not configured"} />
          <Stat label="Contact ready" value={contactReady} sub={`${Math.max(warehouses.length - contactReady, 0)} missing contact details`} />
        </div>
      </motion.div>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 0.1, duration: 0.4 }}
        className="overflow-hidden rounded-2xl bg-white"
      >
        <div className="flex items-center gap-2.5 py-3">
          <span className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Warehouse Queue</span>
          <div className="h-3.5 w-px bg-black/10" />
          <span className="text-[13px] tabular-nums text-muted-foreground">{isLoading ? "—" : `${filteredWarehouses.length} warehouses`}</span>
        </div>

        <div className="flex flex-col gap-3 border-b border-black/[0.07] py-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <MagnifyingGlass weight="light" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input data-testid="input-search-warehouses" aria-label="Search warehouses" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search warehouses…" className="h-9 w-full rounded-full border-0 bg-black/[0.05] pl-9 pr-3 text-sm outline-none placeholder:text-black/35 focus:ring-1 focus:ring-black/20" />
          </div>
        </div>

        <div className="pb-6 pt-4">
          {isError ? (
            <div className="py-20 text-center">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-black/[0.045]">
                <Buildings size={28} weight="light" className="text-muted-foreground" />
              </span>
              <p className="text-sm font-semibold text-foreground">Couldn’t load warehouses</p>
              <p className="mt-1 text-[12px] text-muted-foreground">Check your connection and try again.</p>
              <button type="button" onClick={() => void refetch()} className="mt-4 rounded-full bg-black/[0.05] px-4 py-2 text-[12px] font-medium text-black transition-colors hover:bg-black/[0.08]">Try again</button>
            </div>
          ) : isLoading ? (
            <div className="space-y-4" aria-label="Loading warehouses">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-2xl bg-black/[0.02]" />
              ))}
            </div>
          ) : warehouses.length === 0 ? (
            <div className="py-20 text-center">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-black/[0.045]">
                <Buildings size={28} weight="light" className="text-muted-foreground" />
              </span>
              <p className="text-sm font-semibold text-foreground">No warehouses yet</p>
              <p className="mx-auto mt-1 max-w-xs text-[12px] text-muted-foreground">Create your first inventory location to start routing products and orders.</p>
              <RichButton type="button" onClick={openCreate} className="mt-4 h-9 rounded-xl bg-black px-3 text-[11px] text-white hover:bg-black"><Plus size={14} weight="light" /> New Warehouse</RichButton>
            </div>
          ) : filteredWarehouses.length === 0 ? (
            <div className="py-20 text-center">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-black/[0.045]">
                <MagnifyingGlass size={28} weight="light" className="text-muted-foreground" />
              </span>
              <p className="text-sm font-semibold text-foreground">No matching warehouses</p>
              <p className="mt-1 text-[12px] text-muted-foreground">Try a different search.</p>
              <button type="button" onClick={() => setSearch("")} className="mt-2 text-[12px] font-medium text-black/45 underline underline-offset-4">Clear search</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-black/10 bg-[#F8F8F6] hover:bg-[#F8F8F6]">
                    <th className={`${thClass} pl-4 text-left`}>Warehouse</th>
                    <th className={`${thClass} text-left`}>Contact</th>
                    <th className={`${thClass} text-center`}>Products</th>
                    <th className={`${thClass} text-center`}>Status</th>
                    <th className={`${thClass} pr-4 text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWarehouses.map((warehouse) => (
                    <tr key={warehouse.id} data-testid={`row-warehouse-${warehouse.id}`} tabIndex={0} aria-label={`Open ${warehouse.name}`} onClick={(event) => {
                      if ((event.target as HTMLElement).closest("button, a, input")) return;
                      navigateToWarehouse(warehouse);
                    }} onKeyDown={(event) => {
                      if ((event.key === "Enter" || event.key === " ") && !(event.target as HTMLElement).closest("button, a, input")) {
                        event.preventDefault(); navigateToWarehouse(warehouse);
                      }
                    }} className="group cursor-pointer border-b border-black/[0.02] transition-colors hover:bg-black/[0.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15 focus-visible:ring-inset">
                      <td className="py-3 pl-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] text-black/45"><Buildings size={19} weight="light" /></span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-sm tracking-tight">{warehouse.name}</p>
                            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-black/45"><MapPin size={12} weight="light" className="shrink-0" />{warehouse.address || "No address added"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-sm tracking-tight">{warehouse.contact_person || "No contact"}</span>
                          <span className="text-[11px] text-black">{warehouse.phone || "No phone"}</span>
                        </div>
                      </td>
                      <td className="py-3 text-center">
                        <span className="text-[13px] font-semibold tabular-nums text-black">{warehouse.product_count ?? 0}</span>
                        <p className="text-[10px] text-black/35">assigned</p>
                      </td>
                      <td className="py-3 text-center">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${warehouse.is_default ? "bg-black text-white" : "bg-black/[0.05] text-black/55"}`}>{warehouse.is_default ? "Default" : "Active"}</span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" aria-label={`Edit ${warehouse.name}`} onClick={(event) => { event.stopPropagation(); openEdit(warehouse); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-black/40 transition-colors hover:bg-black/[0.05] hover:text-black"><PencilSimple size={15} weight="light" /></button>
                          <button type="button" aria-label={`Delete ${warehouse.name}`} disabled={warehouse.is_default || deletingId === warehouse.id} title={warehouse.is_default ? "The default warehouse cannot be deleted" : `Delete ${warehouse.name}`} onClick={(event) => { event.stopPropagation(); void remove(warehouse); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-25"><Trash size={15} weight="light" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
      <WarehouseDialog open={dialogOpen} warehouse={editing} onClose={() => setDialogOpen(false)} onSaved={refetch} />
    </div>
  );
}
