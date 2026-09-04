import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Package, Plus, X } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { RichButton } from "@/components/ui/rich-button";
import { Spinner } from "@/components/ui/ios-spinner";

type PickerProduct = {
  id: string;
  name: string;
  selling_price: number | null;
  stock_quantity: number | null;
  warehouse_id: string | null;
};

export function AddProductsDialog({ open, warehouseId, warehouseName, onClose, onAssigned }: {
  open: boolean;
  warehouseId: string;
  warehouseName: string;
  onClose: () => void;
  onAssigned: () => Promise<unknown> | void;
}) {
  const reduce = useReducedMotion();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<PickerProduct[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelected([]);
    setProducts(null);
    setLoadError(null);
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch("/api/products");
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Failed to load products");
        if (!cancelled) setProducts(Array.isArray(body?.products) ? body.products : []);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Failed to load products");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !assigning) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [assigning, onClose, open]);

  const eligible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (products ?? [])
      .filter((product) => product.warehouse_id !== warehouseId)
      .filter((product) => !query || product.name.toLowerCase().includes(query));
  }, [products, search, warehouseId]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function assign() {
    if (selected.length === 0 || assigning) return;
    setAssigning(true);
    try {
      const response = await apiFetch("/api/products/bulk-assign-warehouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: selected, warehouse_id: warehouseId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Failed to assign products");
      await onAssigned();
      toast.success(selected.length === 1 ? "Product assigned" : `${selected.length} products assigned`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign products");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="add-products-dialog-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          className="fixed inset-0 z-40 grid place-items-center bg-black/12 px-4 backdrop-blur-[3px]"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget && !assigning) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-products-dialog-title"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97, filter: "blur(4px)" }}
            transition={{ duration: reduce ? 0.12 : 0.24, ease: "easeOut" }}
            className="max-h-[88vh] w-full max-w-lg overflow-hidden rounded-[24px] border border-black/10 bg-[#FAFAF8] shadow-2xl shadow-black/15"
          >
            <div className="flex items-center justify-between border-b border-black/[0.08] bg-white px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/[0.05] text-black/60">
                  <Package size={20} weight="light" />
                </span>
                <div>
                  <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/35">Add to {warehouseName}</p>
                  <h2 id="add-products-dialog-title" className="mt-0.5 text-[20px] font-bold tracking-tight text-black">
                    Add products
                  </h2>
                </div>
              </div>
              <button type="button" onClick={onClose} disabled={assigning} aria-label="Close add products dialog" className="flex h-9 w-9 items-center justify-center rounded-xl text-black/35 transition-colors hover:bg-black/[0.04] hover:text-black disabled:opacity-40">
                <X size={18} weight="light" />
              </button>
            </div>

            <div className="max-h-[calc(88vh-82px)] overflow-y-auto p-5">
              <Input ref={searchRef} role="searchbox" aria-label="Search products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products…" className="h-10 rounded-[12px] border-black/10 bg-white px-3 text-[13px] shadow-none focus-visible:ring-1 focus-visible:ring-black/20" />
              <div className="mt-4">
                {loading ? (
                  <div className="flex items-center justify-center py-10 text-black/40"><Spinner className="mr-2" /><span className="text-[13px]">Loading products…</span></div>
                ) : loadError ? (
                  <div className="py-10 text-center">
                    <p className="text-[13px] font-medium text-black">{loadError}</p>
                    <button type="button" onClick={() => { setLoadError(null); setLoading(true); void apiFetch("/api/products").then((r) => r.json().catch(() => ({}))).then((body) => setProducts(Array.isArray(body?.products) ? body.products : [])).catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Failed to load products")).finally(() => setLoading(false)); }} className="mt-2 text-[12px] font-medium underline underline-offset-4">Try again</button>
                  </div>
                ) : eligible.length === 0 ? (
                  <p className="py-10 text-center text-[13px] text-black/45">All products are already assigned here.</p>
                ) : (
                  <ul className="space-y-2">
                    {eligible.map((product) => (
                      <li key={product.id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-black/[0.06] bg-white p-3">
                          <Checkbox checked={selected.includes(product.id)} onCheckedChange={() => toggle(product.id)} aria-label={product.name} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-black">{product.name}</span>
                            <span className="mt-0.5 block text-[11px] text-black/40">
                              {product.selling_price == null ? "Price not set" : `৳${product.selling_price.toLocaleString()}`} · {product.stock_quantity ?? 0} in stock
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-6 flex items-center justify-end gap-2 border-t border-black/[0.06] pt-4">
                <Button type="button" variant="ghost" onClick={onClose} disabled={assigning} className="h-10 rounded-xl px-4 text-[12px] font-medium">Cancel</Button>
                <RichButton type="button" onClick={() => void assign()} disabled={assigning || selected.length === 0} aria-label={assigning ? "Assigning products" : selected.length === 0 ? "Assign products" : `Assign ${selected.length} product${selected.length === 1 ? "" : "s"}`} className="h-10 min-w-[132px] justify-center rounded-xl bg-black px-4 text-[12px] text-white hover:bg-black">
                  {assigning ? <><Spinner className="mr-2 text-white" />Assigning…</> : <><Plus size={14} weight="light" />{selected.length === 0 ? "Assign products" : `Assign ${selected.length} product${selected.length === 1 ? "" : "s"}`}</>}
                </RichButton>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
