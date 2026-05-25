import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Link2, Trash2, PackageSearch,
  Package2, TrendingUp, Globe2, RefreshCw,
  ChevronDown, Plus, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import { AnimatedText } from "@/components/ui/animated-text";
import { useUserRole } from "@/hooks/useUserRole";

function SaveIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17.9808V12.7075C3 9.07416 3 7.25748 4.09835 6.12874C5.1967 5 6.96447 5 10.5 5C14.0355 5 15.8033 5 16.9017 6.12874C18 7.25748 18 9.07416 18 12.7075V17.9808C18 20.2867 18 21.4396 17.2755 21.8523C15.8724 22.6514 13.2405 19.9852 11.9906 19.1824C11.2657 18.7168 10.9033 18.484 10.5 18.484C10.0967 18.484 9.73425 18.7168 9.00938 19.1824C7.7595 19.9852 5.12763 22.6514 3.72454 21.8523C3 21.4396 3 20.2867 3 17.9808Z" />
      <path d="M9 2H11C15.714 2 18.0711 2 19.5355 3.46447C21 4.92893 21 7.28595 21 12V18" />
    </svg>
  );
}

type ProductVariant = {
  id: string;
  product_id: string;
  size: string | null;
  color: string | null;
  sku: string | null;
  cog: number;
  stock_quantity: number;
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

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "৳" + Number(n).toLocaleString("en-BD", { minimumFractionDigits: 0 });
}

function margin(selling: number | null, cog: number) {
  if (!selling || selling === 0) return null;
  return (((selling - cog) / selling) * 100).toFixed(1);
}

// ── Variants panel ────────────────────────────────────────────────────────────

type VariantsPanelProps = {
  product: Product;
  isAdmin: boolean;
  onClose: () => void;
};

function VariantsPanel({ product, isAdmin, onClose }: VariantsPanelProps) {
  const qc = useQueryClient();
  const [newSize, setNewSize] = useState("");
  const [newColor, setNewColor] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newCog, setNewCog] = useState("0");
  const [newStock, setNewStock] = useState("0");
  const [adding, setAdding] = useState(false);
  const [variantEdits, setVariantEdits] = useState<Record<string, { stock?: string; cog?: string }>>({});
  const [savingVariants, setSavingVariants] = useState<Set<string>>(new Set());

  const variants = product.variants;

  async function addVariant() {
    if (!newSize.trim() && !newColor.trim()) {
      toast.error("Enter at least a size or color");
      return;
    }
    setAdding(true);
    try {
      const res = await apiFetch(`/api/products/${product.id}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          size: newSize.trim() || null,
          color: newColor.trim() || null,
          sku: newSku.trim() || null,
          cog: parseFloat(newCog) || 0,
          stock_quantity: Math.max(0, parseInt(newStock, 10) || 0),
        }),
      });
      if (!res.ok) throw new Error("Failed to add variant");
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      setNewSize(""); setNewColor(""); setNewSku(""); setNewCog("0"); setNewStock("0");
      toast.success("Variant added");
    } catch {
      toast.error("Failed to add variant");
    } finally {
      setAdding(false);
    }
  }

  async function saveVariant(v: ProductVariant) {
    const edits = variantEdits[v.id] || {};
    if (!edits.stock && !edits.cog) return;
    setSavingVariants((s) => new Set(s).add(v.id));
    try {
      const patch: Record<string, unknown> = {};
      if (edits.stock !== undefined) patch.stock_quantity = Math.max(0, parseInt(edits.stock, 10) || 0);
      if (edits.cog !== undefined) patch.cog = parseFloat(edits.cog) || 0;
      const res = await apiFetch(`/api/products/${product.id}/variants/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Save failed");
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      setVariantEdits((e) => { const n = { ...e }; delete n[v.id]; return n; });
      toast.success("Variant updated");
    } catch {
      toast.error("Failed to save variant");
    } finally {
      setSavingVariants((s) => { const n = new Set(s); n.delete(v.id); return n; });
    }
  }

  async function deleteVariant(variantId: string) {
    try {
      const res = await apiFetch(`/api/products/${product.id}/variants/${variantId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      toast.success("Variant removed");
    } catch {
      toast.error("Failed to remove variant");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden border-t border-black/[0.06] bg-black/[0.02]"
    >
      <div className="px-6 py-4 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Variants — {product.name}
          </p>
          <button onClick={onClose} className="rounded p-1 hover:bg-black/[0.06]">
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Existing variants */}
        {variants.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-black/[0.08]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/[0.08] bg-black/[0.025]">
                  {["Size", "Color", "SKU", isAdmin ? "COG" : null, "Stock", ""].filter(Boolean).map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => {
                  const ve = variantEdits[v.id] || {};
                  const stockVal = ve.stock ?? String(v.stock_quantity);
                  const cogVal = ve.cog ?? String(v.cog);
                  const isDirty = ve.stock !== undefined || ve.cog !== undefined;
                  const isSaving = savingVariants.has(v.id);
                  return (
                    <tr key={v.id} className="border-b border-black/[0.05] last:border-0 hover:bg-black/[0.02]">
                      <td className="px-3 py-2 text-foreground">{v.size || <span className="text-muted-foreground/50">—</span>}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          {v.color && (
                            <span
                              className="inline-block h-3 w-3 rounded-full border border-black/10"
                              style={{ background: v.color.match(/^#[0-9a-f]{3,6}$/i) ? v.color : undefined }}
                            />
                          )}
                          {v.color || <span className="text-muted-foreground/50">—</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{v.sku || <span className="text-muted-foreground/50">—</span>}</td>
                      {isAdmin && (
                        <td className="px-3 py-2">
                          <div className="relative w-24">
                            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">৳</span>
                            <input
                              type="number"
                              min={0}
                              value={cogVal}
                              onChange={(e) => setVariantEdits((prev) => ({ ...prev, [v.id]: { ...prev[v.id], cog: e.target.value } }))}
                              onKeyDown={(e) => e.key === "Enter" && isDirty && saveVariant(v)}
                              className="h-7 w-full rounded-lg border-0 bg-black/[0.06] pl-5 pr-2 font-mono text-xs text-foreground outline-none tabular-nums focus:ring-1 focus:ring-black/20"
                            />
                          </div>
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            value={stockVal}
                            onChange={(e) => setVariantEdits((prev) => ({ ...prev, [v.id]: { ...prev[v.id], stock: e.target.value } }))}
                            onKeyDown={(e) => e.key === "Enter" && isDirty && saveVariant(v)}
                            className="h-7 w-20 rounded-lg border-0 bg-black/[0.06] px-2 font-mono text-xs text-foreground outline-none tabular-nums focus:ring-1 focus:ring-black/20"
                          />
                          {isDirty && (
                            <button
                              onClick={() => saveVariant(v)}
                              disabled={isSaving}
                              className="h-7 rounded-lg bg-black px-2 text-white disabled:opacity-40 hover:bg-black/80"
                            >
                              {isSaving ? <Spinner size="sm" /> : <SaveIcon className="h-3 w-3" />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => deleteVariant(v.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No variants yet — add one below.</p>
        )}

        {/* Add variant form */}
        <div className="rounded-xl border border-black/[0.08] bg-white p-4 space-y-3">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Add variant</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Size</label>
              <input
                type="text"
                placeholder="S / M / L / XL"
                value={newSize}
                onChange={(e) => setNewSize(e.target.value)}
                className="h-8 w-full rounded-lg border-0 bg-black/[0.06] px-3 text-sm text-foreground outline-none placeholder:text-black/30 focus:ring-1 focus:ring-black/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Color</label>
              <input
                type="text"
                placeholder="Black / Red / #1A2B3C"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-8 w-full rounded-lg border-0 bg-black/[0.06] px-3 text-sm text-foreground outline-none placeholder:text-black/30 focus:ring-1 focus:ring-black/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">SKU</label>
              <input
                type="text"
                placeholder="Optional"
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                className="h-8 w-full rounded-lg border-0 bg-black/[0.06] px-3 text-sm text-foreground outline-none placeholder:text-black/30 focus:ring-1 focus:ring-black/20"
              />
            </div>
            {isAdmin && (
              <div className="space-y-1">
                <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">COG (৳)</label>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={newCog}
                  onChange={(e) => setNewCog(e.target.value)}
                  className="h-8 w-full rounded-lg border-0 bg-black/[0.06] px-3 font-mono text-sm text-foreground outline-none tabular-nums focus:ring-1 focus:ring-black/20"
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Stock</label>
              <input
                type="number"
                min={0}
                placeholder="0"
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
                className="h-8 w-full rounded-lg border-0 bg-black/[0.06] px-3 font-mono text-sm text-foreground outline-none tabular-nums focus:ring-1 focus:ring-black/20"
              />
            </div>
          </div>
          <button
            onClick={addVariant}
            disabled={adding}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-black px-3 text-xs font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-40"
          >
            {adding ? <Spinner size="sm" /> : <Plus className="h-3 w-3" />}
            Add variant
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Products() {
  const qc = useQueryClient();
  const { isAdmin } = useUserRole();
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawlStatus, setCrawlStatus] = useState<"idle" | "crawling" | "done" | "error">("idle");
  const [crawlMsg, setCrawlMsg] = useState("");
  const [cogEdits, setCogEdits] = useState<Record<string, string>>({});
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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

  // Derived totals — when a product has variants, sum variant stock; otherwise use product-level stock
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

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

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
      toast.success("Product metrics updated");
    } catch {
      toast.error("Failed to save product metrics");
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
    <div className="min-h-full">
      <div className="mx-auto max-w-[1800px] space-y-6 p-1 lg:p-2">

        {/* ── Summary panel ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="overflow-hidden rounded-2xl border border-black/10 bg-white"
        >
          {/* Header row */}
          <div className="flex h-[50px] items-center justify-between border-b border-black/10 px-6">
            <div className="flex items-center gap-2.5">
              <Package2 className="h-3.5 w-3.5 text-muted-foreground" />
              <AnimatedText className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Product Catalogue</AnimatedText>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-black/10 bg-black/[0.035] px-3 text-sm font-medium text-foreground/70 transition-all hover:border-black/20 hover:bg-black/[0.06] hover:text-foreground disabled:opacity-30"
              data-testid="button-refresh-products"
              title="Refresh"
            >
              {isLoading
                ? <Spinner size="sm" />
                : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </button>
          </div>

          {/* Stats cells */}
          <div className="grid divide-y divide-black/10 md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="min-w-0 px-6 py-5">
              <div className="flex items-start justify-between">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Total Products</p>
                <Package2 className="mt-0.5 h-3.5 w-3.5 text-muted-foreground/70" />
              </div>
              {isLoading
                ? <div className="h-8 w-12 animate-pulse rounded-lg bg-black/[0.06]" />
                : <p className="font-sf-display text-2xl font-bold tracking-tight text-foreground tabular-nums">{totalProducts}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">In catalogue</p>
            </div>

            <div className="min-w-0 px-6 py-5">
              <div className="flex items-start justify-between">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Avg. Margin</p>
                <TrendingUp className="mt-0.5 h-3.5 w-3.5 text-muted-foreground/70" />
              </div>
              {isLoading
                ? <div className="h-8 w-16 animate-pulse rounded-lg bg-black/[0.06]" />
                : <p className={cn("font-sf-display text-2xl font-bold tracking-tight tabular-nums",
                    avgMargin == null ? "text-foreground"
                    : parseFloat(avgMargin) > 40 ? "text-emerald-600"
                    : parseFloat(avgMargin) > 20 ? "text-foreground"
                    : "text-red-500"
                  )}>
                    {avgMargin != null ? `${avgMargin}%` : "—"}
                  </p>}
              <p className="mt-1 text-[11px] text-muted-foreground">Selling price - COG</p>
            </div>

            <div className="min-w-0 px-6 py-5">
              <div className="flex items-start justify-between">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Total Stock</p>
                <Package2 className="mt-0.5 h-3.5 w-3.5 text-muted-foreground/70" />
              </div>
              {isLoading
                ? <div className="h-8 w-20 animate-pulse rounded-lg bg-black/[0.06]" />
                : <p className="font-sf-display text-2xl font-bold tracking-tight text-foreground tabular-nums">{totalStock.toLocaleString("en-BD")}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">Units available</p>
            </div>
          </div>
          <div className="border-t border-black/10 px-6 py-3 text-xs text-muted-foreground">
            Total COG value: <span className="font-medium text-foreground">{fmt(totalCogValue)}</span>
          </div>
        </motion.div>

        {/* ── Crawl panel ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="overflow-hidden rounded-2xl border border-black/10 bg-white"
        >
          <div className="flex h-[50px] items-center gap-2.5 border-b border-black/10 px-6">
            <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
            <AnimatedText className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Import from Website</AnimatedText>
          </div>

          <div className="space-y-3 px-6 py-5">
            <p className="text-sm text-muted-foreground">
              Paste your store URL — AI will extract all products automatically.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                data-testid="input-crawl-url"
                type="url"
                placeholder="https://yourstore.com"
                value={crawlUrl}
                onChange={(e) => setCrawlUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !isCrawling && handleCrawl()}
                className="h-10 flex-1 rounded-xl border-0 bg-black/[0.06] px-3 text-sm text-foreground shadow-none outline-none placeholder:text-black/35 transition-colors focus:ring-1 focus:ring-black/20"
              />
              <button
                data-testid="button-crawl"
                onClick={handleCrawl}
                disabled={isCrawling || !crawlUrl.trim()}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-black px-5 text-sm font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-30"
              >
                {isCrawling
                  ? <><Spinner size="sm" />Extracting</>
                  : <><RefreshCw className="h-3 w-3" />Extract</>}
              </button>
            </div>

            <AnimatePresence>
              {crawlMsg && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn("text-[10px] tracking-wide",
                    crawlStatus === "error" ? "text-red-500"
                    : crawlStatus === "done" ? "text-emerald-600"
                    : "text-foreground"
                  )}
                >
                  {crawlMsg}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── Products table ── */}
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="overflow-hidden rounded-2xl border border-black/10 bg-white"
          >
            {/* Table header */}
            <div className="flex h-[50px] items-center justify-between border-b border-black/10 px-6">
              <AnimatedText className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">
                Products
              </AnimatedText>
              <span className="text-[13px] text-muted-foreground tabular-nums">{products.length} items</span>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Spinner className="mr-2" />
                <span className="text-sm font-medium">Loading products</span>
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center space-y-2 py-24">
                <PackageSearch className="h-9 w-9 text-black/15" />
                <p className="text-sm font-semibold text-foreground">No products yet</p>
                <p className="text-sm text-muted-foreground">Paste a store URL above to import products</p>
              </div>
            ) : (
              <>
                {/* Column labels */}
                <div className={cn(
                  "grid gap-0 border-b border-black/10 bg-black/[0.025]",
                  isAdmin
                    ? "grid-cols-[56px_minmax(220px,1fr)_130px_130px_130px_100px_52px]"
                    : "grid-cols-[56px_minmax(220px,1fr)_130px_130px_100px_52px]"
                )}>
                  {(isAdmin
                    ? ["", "Product", "Selling Price", "COG", "Stock", "Margin", ""]
                    : ["", "Product", "Selling Price", "Stock", "Margin", ""]
                  ).map((h, i) => (
                    <div key={i} className={cn("px-4 py-3", i === 0 ? "pl-6" : i === 6 ? "pr-4" : "")}>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{h}</span>
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
                    const isExpanded = expandedIds.has(product.id);
                    const hasVariants = product.variants.length > 0;
                    // When variants exist show their total stock, not the product-level stock
                    const displayStock = hasVariants
                      ? product.variants.reduce((s, v) => s + v.stock_quantity, 0)
                      : product.stock_quantity;

                    return (
                      <motion.div
                        key={product.id}
                        data-testid={`row-product-${product.id}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15, delay: idx * 0.02 }}
                      >
                        {/* Product row */}
                        <div
                          className={cn(
                            "group grid gap-0 border-b border-black/[0.06] transition-colors last:border-0 hover:bg-black/[0.025]",
                            isAdmin
                              ? "grid-cols-[56px_minmax(220px,1fr)_130px_130px_130px_100px_52px]"
                              : "grid-cols-[56px_minmax(220px,1fr)_130px_130px_100px_52px]",
                            isExpanded && "bg-black/[0.015]"
                          )}
                        >
                          {/* Image */}
                          <div className="flex items-center py-3.5 pl-6">
                            <div className="size-9 shrink-0 overflow-hidden rounded-lg bg-black/[0.05]">
                              {product.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt={product.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package2 className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Name + URL + variants toggle */}
                          <div className="flex min-w-0 flex-col justify-center px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <p data-testid={`text-product-name-${product.id}`}
                                className="truncate text-sm font-medium leading-none text-foreground">
                                {product.name}
                              </p>
                              {/* Variants badge / toggle */}
                              <button
                                onClick={() => toggleExpanded(product.id)}
                                className={cn(
                                  "flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest transition-colors",
                                  hasVariants
                                    ? "bg-violet-50 text-violet-600 hover:bg-violet-100"
                                    : "bg-black/[0.05] text-muted-foreground hover:bg-black/[0.09]"
                                )}
                                title={isExpanded ? "Hide variants" : "Manage variants"}
                              >
                                <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", isExpanded && "rotate-180")} />
                                {hasVariants ? `${product.variants.length} var.` : "Variants"}
                              </button>
                            </div>
                            {product.url && (
                              <a
                                href={product.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid={`link-product-${product.id}`}
                                className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground transition-colors hover:text-foreground"
                              >
                                <Link2 className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">{product.url.replace(/^https?:\/\//, "").substring(0, 45)}</span>
                              </a>
                            )}
                          </div>

                          {/* Selling price */}
                          <div className="flex items-center px-4 py-3.5">
                            <span data-testid={`text-selling-price-${product.id}`}
                              className="font-mono text-sm text-foreground tabular-nums">
                              {fmt(product.selling_price)}
                            </span>
                          </div>

                          {/* COG input — admin only */}
                          {isAdmin && (
                          <div className="flex items-center gap-2 px-4 py-3.5">
                            <div className="relative flex-1">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">৳</span>
                              <input
                                data-testid={`input-cog-${product.id}`}
                                type="number"
                                min={0}
                                value={cogVal}
                                onChange={(e) => setCogEdits((prev) => ({ ...prev, [product.id]: e.target.value }))}
                                onKeyDown={(e) => e.key === "Enter" && isDirty && saveProductMetrics(product)}
                                className="h-8 w-full rounded-lg border-0 bg-black/[0.06] pl-6 pr-2 font-mono text-sm text-foreground outline-none transition-colors tabular-nums focus:ring-1 focus:ring-black/20"
                              />
                            </div>
                          </div>
                          )}

                          {/* Stock — show variant total (read-only) when variants exist, otherwise editable */}
                          <div className="flex items-center gap-2 px-4 py-3.5">
                            {hasVariants ? (
                              <span
                                className="font-mono text-sm text-foreground tabular-nums"
                                title="Sum of all variant stock — edit per-variant below"
                              >
                                {displayStock}
                                <span className="ml-1 text-[9px] font-medium uppercase tracking-widest text-muted-foreground">total</span>
                              </span>
                            ) : (
                              <>
                                <input
                                  data-testid={`input-stock-${product.id}`}
                                  type="number"
                                  min={0}
                                  value={stockVal}
                                  onChange={(e) => setStockEdits((prev) => ({ ...prev, [product.id]: e.target.value }))}
                                  onKeyDown={(e) => e.key === "Enter" && isDirty && saveProductMetrics(product)}
                                  className="h-8 w-full rounded-lg border-0 bg-black/[0.06] px-3 font-mono text-sm text-foreground outline-none transition-colors tabular-nums focus:ring-1 focus:ring-black/20"
                                />
                                {isDirty && (
                                  <button
                                    data-testid={`button-save-metrics-${product.id}`}
                                    onClick={() => saveProductMetrics(product)}
                                    disabled={isSaving}
                                    className="h-8 shrink-0 rounded-lg bg-black px-2.5 text-xs font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-40"
                                  >
                                    {isSaving ? <Spinner size="sm" /> : <SaveIcon className="h-3 w-3" />}
                                  </button>
                                )}
                              </>
                            )}
                          </div>

                          {/* Margin */}
                          <div className="flex items-center px-4 py-3.5">
                            <span
                              data-testid={`text-margin-${product.id}`}
                              className={cn("font-mono text-sm tabular-nums",
                                mgn == null ? "text-foreground"
                                : parseFloat(mgn) > 40 ? "text-emerald-600"
                                : parseFloat(mgn) > 20 ? "text-foreground"
                                : "text-red-500"
                              )}
                            >
                              {mgn != null ? `${mgn}%` : "—"}
                            </span>
                          </div>

                          {/* Delete */}
                          <div className="flex items-center justify-end py-3.5 pr-4">
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

                        {/* Expandable variants panel */}
                        <AnimatePresence>
                          {isExpanded && (
                            <VariantsPanel
                              product={product}
                              isAdmin={isAdmin}
                              onClose={() => toggleExpanded(product.id)}
                            />
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </>
            )}
          </motion.div>
      </div>
    </div>
  );
}
