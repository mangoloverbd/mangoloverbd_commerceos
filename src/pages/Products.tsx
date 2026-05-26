import { useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Link2, Trash2, PackageSearch, Package2,
  TrendingUp, Globe2, RefreshCw, Plus, X,
  Pencil, Check, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import { AnimatedText } from "@/components/ui/animated-text";
import { useUserRole } from "@/hooks/useUserRole";

// ── Types ────────────────────────────────────────────────────────────────────

type ProductVariant = {
  id: string;
  product_id: string;
  attributes: Record<string, string>;   // universal — any key/value pairs
  cog: number;
  stock_quantity: number;
  price_adjustment: number;
  org_id: string | null;
  created_at: string;
};

type Product = {
  id: string;
  name: string;
  url: string | null;
  image_url: string | null;
  selling_price: number | null;
  cog: number;
  stock_quantity: number;
  source_url: string | null;
  created_at: string;
  variants: ProductVariant[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "৳" + Number(n).toLocaleString("en-BD", { minimumFractionDigits: 0 });
}

function margin(selling: number | null, cog: number) {
  if (!selling || selling === 0) return null;
  return (((selling - cog) / selling) * 100).toFixed(1);
}

function stockStatus(qty: number): "out" | "low" | "ok" {
  if (qty === 0) return "out";
  if (qty <= 5) return "low";
  return "ok";
}

/** Render all attribute key=value pairs as a readable label, e.g. "Black · M" */
function attrLabel(attributes: Record<string, string>): string {
  return Object.values(attributes)
    .filter(Boolean)
    .join(" · ");
}

function SaveIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17.9808V12.7075C3 9.07416 3 7.25748 4.09835 6.12874C5.1967 5 6.96447 5 10.5 5C14.0355 5 15.8033 5 16.9017 6.12874C18 7.25748 18 9.07416 18 12.7075V17.9808C18 20.2867 18 21.4396 17.2755 21.8523C15.8724 22.6514 13.2405 19.9852 11.9906 19.1824C11.2657 18.7168 10.9033 18.484 10.5 18.484C10.0967 18.484 9.73425 18.7168 9.00938 19.1824C7.7595 19.9852 5.12763 22.6514 3.72454 21.8523C3 21.4396 3 20.2867 3 17.9808Z" />
      <path d="M9 2H11C15.714 2 18.0711 2 19.5355 3.46447C21 4.92893 21 7.28595 21 12V18" />
    </svg>
  );
}

// ── Variant chip ─────────────────────────────────────────────────────────────

type VariantChipProps = {
  variant: ProductVariant;
  productId: string;
  isAdmin: boolean;
};

function VariantChip({ variant, productId, isAdmin }: VariantChipProps) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [stockDraft, setStockDraft] = useState(String(variant.stock_quantity));
  const [cogDraft, setCogDraft] = useState(String(variant.cog));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const status = stockStatus(variant.stock_quantity);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // Close on outside click
  useEffect(() => {
    if (!editing) return;
    function onMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setEditing(false);
        setStockDraft(String(variant.stock_quantity));
        setCogDraft(String(variant.cog));
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [editing, variant.stock_quantity, variant.cog]);

  async function save() {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        stock_quantity: Math.max(0, parseInt(stockDraft, 10) || 0),
      };
      if (isAdmin) patch.cog = parseFloat(cogDraft) || 0;
      const res = await apiFetch(`/api/products/${productId}/variants/${variant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      setEditing(false);
      toast.success("Variant updated");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function deleteVariant() {
    try {
      const res = await apiFetch(`/api/products/${productId}/variants/${variant.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      toast.success("Variant removed");
    } catch {
      toast.error("Failed to remove variant");
    }
  }

  const chipBase = cn(
    "relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none transition-all",
    status === "out" && "border-red-200 bg-red-50 text-red-700",
    status === "low" && "border-amber-200 bg-amber-50 text-amber-700",
    status === "ok"  && "border-black/[0.08] bg-black/[0.03] text-foreground"
  );

  return (
    <div className="relative inline-block" ref={panelRef}>
      {/* The pill itself */}
      <button
        onClick={() => setEditing((v) => !v)}
        className={cn(chipBase, "cursor-pointer hover:shadow-sm group/chip")}
        title="Click to edit stock"
      >
        {/* Stock status dot */}
        <span className={cn(
          "h-1.5 w-1.5 rounded-full shrink-0",
          status === "out" && "bg-red-500",
          status === "low" && "bg-amber-400",
          status === "ok"  && "bg-emerald-500"
        )} />

        {/* Attribute label — dynamic, not hardcoded */}
        <span>{attrLabel(variant.attributes)}</span>

        {/* Separator */}
        <span className="opacity-30">·</span>

        {/* Stock count */}
        <span className={cn(
          "tabular-nums",
          status === "out" && "font-semibold",
          status === "low" && "font-semibold"
        )}>
          {status === "out" ? "Out" : `${variant.stock_quantity}`}
        </span>

        {/* Edit pencil — appears on hover */}
        <Pencil className="h-2.5 w-2.5 opacity-0 group-hover/chip:opacity-50 transition-opacity shrink-0" />
      </button>

      {/* Inline edit popover */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 top-full z-50 mt-1.5 w-56 rounded-xl border border-black/[0.10] bg-white p-3 shadow-xl shadow-black/[0.08]"
          >
            {/* Attribute tags (read-only display) */}
            <div className="mb-2.5 flex flex-wrap gap-1">
              {Object.entries(variant.attributes).map(([k, v]) => (
                <span key={k} className="rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                  <span className="text-muted-foreground">{k}:</span> {v}
                </span>
              ))}
            </div>

            <div className="space-y-2">
              <div className="space-y-0.5">
                <label className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Stock</label>
                <input
                  ref={inputRef}
                  type="number"
                  min={0}
                  value={stockDraft}
                  onChange={(e) => setStockDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  className="h-8 w-full rounded-lg border-0 bg-black/[0.06] px-3 font-mono text-sm text-foreground outline-none tabular-nums focus:ring-1 focus:ring-black/20"
                />
              </div>
              {isAdmin && (
                <div className="space-y-0.5">
                  <label className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">COG (৳)</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">৳</span>
                    <input
                      type="number"
                      min={0}
                      value={cogDraft}
                      onChange={(e) => setCogDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && save()}
                      className="h-8 w-full rounded-lg border-0 bg-black/[0.06] pl-6 pr-3 font-mono text-sm text-foreground outline-none tabular-nums focus:ring-1 focus:ring-black/20"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-1.5">
              <button
                onClick={save}
                disabled={saving}
                className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg bg-black text-xs font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-40"
              >
                {saving ? <Spinner size="sm" /> : <><Check className="h-3 w-3" />Save</>}
              </button>
              <button
                onClick={deleteVariant}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500"
                title="Remove variant"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Add-variant drawer (slides open under a product row) ─────────────────────

type AddVariantDrawerProps = {
  product: Product;
  isAdmin: boolean;
  onClose: () => void;
};

function AddVariantDrawer({ product, isAdmin, onClose }: AddVariantDrawerProps) {
  const qc = useQueryClient();
  // Dynamic attribute rows: [{key, value}]
  const [attrRows, setAttrRows] = useState<{ key: string; value: string }[]>([
    { key: "", value: "" },
  ]);
  const [stock, setStock] = useState("0");
  const [cog, setCog] = useState("0");
  const [priceAdj, setPriceAdj] = useState("0");
  const [saving, setSaving] = useState(false);

  function setAttr(idx: number, field: "key" | "value", val: string) {
    setAttrRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));
  }
  function addAttrRow() {
    setAttrRows((rows) => [...rows, { key: "", value: "" }]);
  }
  function removeAttrRow(idx: number) {
    setAttrRows((rows) => rows.filter((_, i) => i !== idx));
  }

  async function handleAdd() {
    const attributes: Record<string, string> = {};
    for (const row of attrRows) {
      const k = row.key.trim().toLowerCase();
      const v = row.value.trim();
      if (k && v) attributes[k] = v;
    }
    if (Object.keys(attributes).length === 0) {
      toast.error("Add at least one attribute (e.g. color: Black)");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/products/${product.id}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attributes,
          stock_quantity: Math.max(0, parseInt(stock, 10) || 0),
          cog: parseFloat(cog) || 0,
          price_adjustment: parseFloat(priceAdj) || 0,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      toast.success("Variant added");
      onClose();
    } catch {
      toast.error("Failed to add variant");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
      className="overflow-hidden border-t border-black/[0.06] bg-[#FAFAF8]"
    >
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Add variant — {product.name}
          </p>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-black/[0.06]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Attribute builder */}
          <div className="flex-1 space-y-2">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
              Attributes <span className="normal-case font-normal tracking-normal">(any combination)</span>
            </p>
            <div className="space-y-1.5">
              {attrRows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="e.g. color, size, weight…"
                    value={row.key}
                    onChange={(e) => setAttr(idx, "key", e.target.value)}
                    className="h-8 w-28 shrink-0 rounded-lg border-0 bg-black/[0.06] px-2.5 text-xs text-foreground outline-none placeholder:text-black/25 focus:ring-1 focus:ring-black/20"
                  />
                  <span className="text-[10px] text-muted-foreground shrink-0">:</span>
                  <input
                    type="text"
                    placeholder="value"
                    value={row.value}
                    onChange={(e) => setAttr(idx, "value", e.target.value)}
                    className="h-8 flex-1 rounded-lg border-0 bg-black/[0.06] px-2.5 text-xs text-foreground outline-none placeholder:text-black/25 focus:ring-1 focus:ring-black/20"
                  />
                  {attrRows.length > 1 && (
                    <button onClick={() => removeAttrRow(idx)} className="rounded p-1 text-muted-foreground hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addAttrRow}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3 w-3" /> Add attribute
            </button>
          </div>

          {/* Numeric fields */}
          <div className="flex flex-wrap gap-3 sm:flex-nowrap">
            <div className="space-y-1 w-24">
              <label className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Stock</label>
              <input
                type="number"
                min={0}
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="h-8 w-full rounded-lg border-0 bg-black/[0.06] px-2.5 font-mono text-sm text-foreground outline-none tabular-nums focus:ring-1 focus:ring-black/20"
              />
            </div>
            {isAdmin && (
              <>
                <div className="space-y-1 w-24">
                  <label className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">COG (৳)</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">৳</span>
                    <input
                      type="number"
                      min={0}
                      value={cog}
                      onChange={(e) => setCog(e.target.value)}
                      className="h-8 w-full rounded-lg border-0 bg-black/[0.06] pl-5 pr-2 font-mono text-sm text-foreground outline-none tabular-nums focus:ring-1 focus:ring-black/20"
                    />
                  </div>
                </div>
                <div className="space-y-1 w-24">
                  <label className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Price ±</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">৳</span>
                    <input
                      type="number"
                      value={priceAdj}
                      onChange={(e) => setPriceAdj(e.target.value)}
                      className="h-8 w-full rounded-lg border-0 bg-black/[0.06] pl-5 pr-2 font-mono text-sm text-foreground outline-none tabular-nums focus:ring-1 focus:ring-black/20"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={handleAdd}
            disabled={saving}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-black px-4 text-xs font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-40"
          >
            {saving ? <Spinner size="sm" /> : <Plus className="h-3 w-3" />}
            Add variant
          </button>
          <button onClick={onClose} className="h-8 rounded-lg border border-black/10 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Inline variant chips row (shown directly in the product row) ──────────────

const CHIPS_VISIBLE = 3;

type VariantChipsProps = {
  product: Product;
  isAdmin: boolean;
  onAddClick: () => void;
};

function VariantChips({ product, isAdmin, onAddClick }: VariantChipsProps) {
  const [showAll, setShowAll] = useState(false);
  const variants = product.variants;

  if (variants.length === 0) {
    return (
      <button
        onClick={onAddClick}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-black/[0.15] px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-black/30 hover:text-foreground"
      >
        <Plus className="h-2.5 w-2.5" />
        Add variants
      </button>
    );
  }

  const visible = showAll ? variants : variants.slice(0, CHIPS_VISIBLE);
  const overflow = variants.length - CHIPS_VISIBLE;
  const hasLowOrOut = variants.some((v) => stockStatus(v.stock_quantity) !== "ok");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((v) => (
        <VariantChip key={v.id} variant={v} productId={product.id} isAdmin={isAdmin} />
      ))}

      {!showAll && overflow > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
            hasLowOrOut
              ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              : "border-black/[0.08] bg-black/[0.03] text-muted-foreground hover:text-foreground"
          )}
        >
          {hasLowOrOut && <AlertTriangle className="h-2.5 w-2.5" />}
          +{overflow} more
        </button>
      )}

      {showAll && overflow > 0 && (
        <button
          onClick={() => setShowAll(false)}
          className="inline-flex items-center rounded-full border border-black/[0.08] px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Show less
        </button>
      )}

      {/* Add new variant button */}
      <button
        onClick={onAddClick}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-black/[0.15] text-muted-foreground transition-colors hover:border-black/30 hover:text-foreground"
        title="Add variant"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── Main Products page ────────────────────────────────────────────────────────

export default function Products() {
  const qc = useQueryClient();
  const { isAdmin } = useUserRole();
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawlStatus, setCrawlStatus] = useState<"idle" | "crawling" | "done" | "error">("idle");
  const [crawlMsg, setCrawlMsg] = useState("");
  const [cogEdits, setCogEdits] = useState<Record<string, string>>({});
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  // Which product has the "add variant" drawer open
  const [addingVariantFor, setAddingVariantFor] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<{ products: Product[] }>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await apiFetch("/api/products");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to load products");
      }
      return res.json();
    },
  });

  const products = data?.products ?? [];

  const totalProducts = products.length;
  const avgMargin = (() => {
    const withBoth = products.filter(p => p.selling_price && p.selling_price > 0);
    if (!withBoth.length) return null;
    const sum = withBoth.reduce((acc, p) => {
      const m = ((p.selling_price! - (p.cog || 0)) / p.selling_price!) * 100;
      return acc + m;
    }, 0);
    return (sum / withBoth.length).toFixed(1);
  })();
  const totalCogValue = products.reduce((acc, p) => acc + (p.cog || 0), 0);
  const totalStock = products.reduce((acc, p) => {
    if (p.variants.length > 0) return acc + p.variants.reduce((s, v) => s + v.stock_quantity, 0);
    return acc + (p.stock_quantity || 0);
  }, 0);
  const outOfStockCount = products.reduce((acc, p) => {
    if (p.variants.length > 0) return acc + p.variants.filter(v => v.stock_quantity === 0).length;
    return acc + (p.stock_quantity === 0 ? 1 : 0);
  }, 0);

  async function saveProducts(prods: unknown[], sourceUrl: string) {
    try {
      const res = await apiFetch("/api/products/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: prods, sourceUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      setCrawlStatus("done");
      setCrawlMsg(`${json.saved} product${json.saved !== 1 ? "s" : ""} imported.`);
      toast.success(`${json.saved} products imported`);
    } catch (e: unknown) {
      setCrawlStatus("error");
      setCrawlMsg(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function handleCrawl() {
    if (!crawlUrl.trim()) return;
    setCrawlStatus("crawling");
    setCrawlMsg("");
    try {
      const res = await apiFetch("/api/products/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: crawlUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Crawl failed");
      if (json.products?.length) {
        await saveProducts(json.products, crawlUrl.trim());
      } else {
        setCrawlStatus("done");
        setCrawlMsg("No products found on that page.");
      }
    } catch (e: unknown) {
      setCrawlStatus("error");
      setCrawlMsg(e instanceof Error ? e.message : "Crawl failed");
    }
  }

  async function saveProductMetrics(product: Product) {
    const hasCog = cogEdits[product.id] !== undefined;
    const hasStock = stockEdits[product.id] !== undefined;
    if (!hasCog && !hasStock) return;
    const update: { cog?: number; stock_quantity?: number } = {};
    if (hasCog) update.cog = parseFloat(cogEdits[product.id]) || 0;
    if (hasStock) update.stock_quantity = Math.max(0, parseInt(stockEdits[product.id], 10) || 0);
    setSavingIds((s) => new Set(s).add(product.id));
    try {
      const res = await apiFetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!res.ok) throw new Error("Save failed");
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      setCogEdits((e) => { const n = { ...e }; delete n[product.id]; return n; });
      setStockEdits((e) => { const n = { ...e }; delete n[product.id]; return n; });
      toast.success("Product updated");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSavingIds((s) => { const n = new Set(s); n.delete(product.id); return n; });
    }
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      toast.success("Product removed");
    },
    onError: () => toast.error("Failed to delete product"),
  });

  const isCrawling = crawlStatus === "crawling";

  return (
    <div className="min-h-full bg-[#FAFAF8]">
      <div className="mx-auto max-w-[1800px] space-y-5 p-1 lg:p-2">

        {/* ── Summary panel ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white"
        >
          <div className="flex h-[50px] items-center justify-between border-b border-black/[0.08] px-6">
            <div className="flex items-center gap-2.5">
              <Package2 className="h-3.5 w-3.5 text-muted-foreground" />
              <AnimatedText className="text-[15px] font-semibold tracking-normal text-foreground">Product Catalogue</AnimatedText>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="flex h-8 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-black/[0.03] px-3 text-xs font-medium text-foreground/70 transition-all hover:bg-black/[0.06] hover:text-foreground disabled:opacity-30"
              data-testid="button-refresh-products"
            >
              {isLoading ? <Spinner size="sm" /> : <RefreshCw className="h-3 w-3" />}
              Refresh
            </button>
          </div>

          <div className="grid divide-y divide-black/[0.06] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            {/* Total products */}
            <div className="px-6 py-5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Total Products</p>
              {isLoading
                ? <div className="h-7 w-10 animate-pulse rounded-lg bg-black/[0.06]" />
                : <p className="text-2xl font-light tabular-nums text-foreground">{totalProducts}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">In catalogue</p>
            </div>

            {/* Avg margin */}
            <div className="px-6 py-5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Avg. Margin</p>
              {isLoading
                ? <div className="h-7 w-14 animate-pulse rounded-lg bg-black/[0.06]" />
                : <p className={cn("text-2xl font-light tabular-nums",
                    avgMargin == null ? "text-foreground"
                    : parseFloat(avgMargin) > 40 ? "text-emerald-600"
                    : parseFloat(avgMargin) > 20 ? "text-foreground"
                    : "text-red-500"
                  )}>
                    {avgMargin != null ? `${avgMargin}%` : "—"}
                  </p>}
              <p className="mt-1 text-[11px] text-muted-foreground">Selling price − COG</p>
            </div>

            {/* Total stock */}
            <div className="px-6 py-5">
              <div className="flex items-start justify-between">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Total Stock</p>
                <TrendingUp className="mt-0.5 h-3.5 w-3.5 text-muted-foreground/60" />
              </div>
              {isLoading
                ? <div className="h-7 w-16 animate-pulse rounded-lg bg-black/[0.06]" />
                : <p className="text-2xl font-light tabular-nums text-foreground">{totalStock.toLocaleString("en-BD")}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">Units available</p>
            </div>

            {/* Out of stock */}
            <div className="px-6 py-5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Out of Stock</p>
              {isLoading
                ? <div className="h-7 w-8 animate-pulse rounded-lg bg-black/[0.06]" />
                : <p className={cn("text-2xl font-light tabular-nums", outOfStockCount > 0 ? "text-red-500" : "text-foreground")}>
                    {outOfStockCount}
                  </p>}
              <p className="mt-1 text-[11px] text-muted-foreground">Variants / products</p>
            </div>
          </div>

          <div className="border-t border-black/[0.06] px-6 py-2.5 text-xs text-muted-foreground">
            Total COG value: <span className="font-medium text-foreground">{fmt(totalCogValue)}</span>
          </div>
        </motion.div>

        {/* ── Import panel ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.04 }}
          className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white"
        >
          <div className="flex h-[50px] items-center gap-2.5 border-b border-black/[0.08] px-6">
            <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
            <AnimatedText className="text-[15px] font-semibold tracking-normal text-foreground">Import from Website</AnimatedText>
          </div>
          <div className="space-y-3 px-6 py-5">
            <p className="text-sm text-muted-foreground">Paste your store URL — AI will extract all products automatically.</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                data-testid="input-crawl-url"
                type="url"
                placeholder="https://yourstore.com"
                value={crawlUrl}
                onChange={(e) => setCrawlUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !isCrawling && handleCrawl()}
                className="h-10 flex-1 rounded-xl border-0 bg-black/[0.06] px-3 text-sm text-foreground outline-none placeholder:text-black/30 transition-colors focus:ring-1 focus:ring-black/20"
              />
              <button
                data-testid="button-crawl"
                onClick={handleCrawl}
                disabled={isCrawling || !crawlUrl.trim()}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-black px-5 text-sm font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-30"
              >
                {isCrawling ? <><Spinner size="sm" />Extracting</> : <><RefreshCw className="h-3 w-3" />Extract</>}
              </button>
            </div>
            <AnimatePresence>
              {crawlMsg && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn("text-[11px]",
                    crawlStatus === "error" ? "text-red-500"
                    : crawlStatus === "done" ? "text-emerald-600"
                    : "text-foreground"
                  )}
                >{crawlMsg}</motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── Products table ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white"
        >
          <div className="flex h-[50px] items-center justify-between border-b border-black/[0.08] px-6">
            <AnimatedText className="text-[15px] font-semibold tracking-normal text-foreground">Products</AnimatedText>
            <span className="text-[12px] text-muted-foreground tabular-nums">{products.length} items</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Spinner className="mr-2" />
              <span className="text-sm">Loading products…</span>
            </div>
          ) : products.length === 0 ? (
            /* ── Empty state ── */
            <div className="flex flex-col items-center justify-center py-24 space-y-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-black/[0.08] bg-black/[0.03]">
                <PackageSearch className="h-6 w-6 text-black/20" />
              </div>
              <p className="text-sm font-semibold text-foreground">No products yet</p>
              <p className="text-sm text-muted-foreground max-w-xs text-center">
                Import from a website URL above, or add products manually once you have stock to track.
              </p>
            </div>
          ) : (
            <>
              {/* Column header */}
              <div className={cn(
                "grid border-b border-black/[0.06] bg-black/[0.02]",
                isAdmin
                  ? "grid-cols-[52px_minmax(200px,1fr)_minmax(280px,2fr)_110px_110px_90px_44px]"
                  : "grid-cols-[52px_minmax(200px,1fr)_minmax(280px,2fr)_110px_90px_44px]"
              )}>
                {(isAdmin
                  ? ["", "Product", "Variants", "Price", "COG", "Margin", ""]
                  : ["", "Product", "Variants", "Price", "Margin", ""]
                ).map((h, i) => (
                  <div key={i} className={cn("px-4 py-2.5", i === 0 && "pl-5")}>
                    <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">{h}</span>
                  </div>
                ))}
              </div>

              <AnimatePresence>
                {products.map((product, idx) => {
                  const cogVal = cogEdits[product.id] ?? String(product.cog ?? 0);
                  const stockVal = stockEdits[product.id] ?? String(product.stock_quantity ?? 0);
                  const cogNum = parseFloat(cogVal) || 0;
                  const mgn = margin(product.selling_price, cogNum);
                  const isDirty = cogEdits[product.id] !== undefined || stockEdits[product.id] !== undefined;
                  const isSaving = savingIds.has(product.id);
                  const isAddingVariant = addingVariantFor === product.id;
                  const hasVariants = product.variants.length > 0;
                  const displayStock = hasVariants
                    ? product.variants.reduce((s, v) => s + v.stock_quantity, 0)
                    : product.stock_quantity;
                  const productStockStatus = stockStatus(displayStock);

                  return (
                    <motion.div
                      key={product.id}
                      data-testid={`row-product-${product.id}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15, delay: idx * 0.015 }}
                    >
                      {/* ── Product row ── */}
                      <div className={cn(
                        "group grid border-b border-black/[0.05] transition-colors last:border-0 hover:bg-black/[0.015]",
                        isAdmin
                          ? "grid-cols-[52px_minmax(200px,1fr)_minmax(280px,2fr)_110px_110px_90px_44px]"
                          : "grid-cols-[52px_minmax(200px,1fr)_minmax(280px,2fr)_110px_90px_44px]",
                        isAddingVariant && "bg-black/[0.01]"
                      )}>

                        {/* Image */}
                        <div className="flex items-start pt-3.5 pl-5">
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-black/[0.05]">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="h-full w-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <Package2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Product name + URL */}
                        <div className="flex min-w-0 flex-col justify-start gap-1 px-4 pt-3.5 pb-3">
                          <p
                            data-testid={`text-product-name-${product.id}`}
                            className="truncate text-sm font-medium leading-none text-foreground"
                          >
                            {product.name}
                          </p>
                          {product.url && (
                            <a
                              href={product.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid={`link-product-${product.id}`}
                              className="flex items-center gap-1 truncate text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <Link2 className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{product.url.replace(/^https?:\/\//, "").substring(0, 40)}</span>
                            </a>
                          )}
                          {/* No-variants stock badge */}
                          {!hasVariants && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                productStockStatus === "out" && "bg-red-500",
                                productStockStatus === "low" && "bg-amber-400",
                                productStockStatus === "ok"  && "bg-emerald-500"
                              )} />
                              <span className={cn(
                                "text-[11px] tabular-nums",
                                productStockStatus === "out" && "text-red-600 font-medium",
                                productStockStatus === "low" && "text-amber-600 font-medium",
                                productStockStatus === "ok"  && "text-muted-foreground"
                              )}>
                                {productStockStatus === "out" ? "Out of stock" : `${displayStock} in stock`}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Variants column — inline chips */}
                        <div className="flex items-start px-4 pt-3.5 pb-3">
                          <VariantChips
                            product={product}
                            isAdmin={isAdmin}
                            onAddClick={() => setAddingVariantFor(isAddingVariant ? null : product.id)}
                          />
                        </div>

                        {/* Selling price */}
                        <div className="flex items-start px-4 pt-3.5 pb-3">
                          <span
                            data-testid={`text-selling-price-${product.id}`}
                            className="font-mono text-sm tabular-nums text-foreground"
                          >
                            {fmt(product.selling_price)}
                          </span>
                        </div>

                        {/* COG — admin editable */}
                        {isAdmin && (
                          <div className="flex items-start gap-1.5 px-4 pt-3.5 pb-3">
                            <div className="relative w-full">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">৳</span>
                              <input
                                data-testid={`input-cog-${product.id}`}
                                type="number"
                                min={0}
                                value={cogVal}
                                onChange={(e) => setCogEdits((p) => ({ ...p, [product.id]: e.target.value }))}
                                onKeyDown={(e) => e.key === "Enter" && isDirty && saveProductMetrics(product)}
                                className="h-8 w-full rounded-lg border-0 bg-black/[0.06] pl-6 pr-2 font-mono text-sm text-foreground outline-none tabular-nums focus:ring-1 focus:ring-black/20"
                              />
                            </div>
                            {isDirty && (
                              <button
                                data-testid={`button-save-metrics-${product.id}`}
                                onClick={() => saveProductMetrics(product)}
                                disabled={isSaving}
                                className="mt-0 h-8 shrink-0 rounded-lg bg-black px-2 text-white disabled:opacity-40 hover:bg-black/80"
                              >
                                {isSaving ? <Spinner size="sm" /> : <SaveIcon className="h-3 w-3" />}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Margin */}
                        <div className="flex items-start px-4 pt-3.5 pb-3">
                          <span
                            data-testid={`text-margin-${product.id}`}
                            className={cn("font-mono text-sm tabular-nums",
                              mgn == null ? "text-muted-foreground"
                              : parseFloat(mgn) > 40 ? "text-emerald-600"
                              : parseFloat(mgn) > 20 ? "text-foreground"
                              : "text-red-500"
                            )}
                          >
                            {mgn != null ? `${mgn}%` : "—"}
                          </span>
                        </div>

                        {/* Delete */}
                        <div className="flex items-start justify-end pt-3.5 pb-3 pr-3">
                          <button
                            data-testid={`button-delete-product-${product.id}`}
                            onClick={() => deleteMutation.mutate(product.id)}
                            className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-colors hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* ── Add variant drawer ── */}
                      <AnimatePresence>
                        {isAddingVariant && (
                          <AddVariantDrawer
                            product={product}
                            isAdmin={isAdmin}
                            onClose={() => setAddingVariantFor(null)}
                          />
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Legend */}
              <div className="flex items-center gap-4 border-t border-black/[0.06] px-6 py-3">
                {[
                  { dot: "bg-emerald-500", label: "In stock" },
                  { dot: "bg-amber-400",   label: "Low stock (≤5)" },
                  { dot: "bg-red-500",     label: "Out of stock" },
                ].map(({ dot, label }) => (
                  <span key={label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={cn("h-2 w-2 rounded-full", dot)} />
                    {label}
                  </span>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
