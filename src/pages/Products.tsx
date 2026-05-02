import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Link2, Trash2, Save, Loader2, PackageSearch,
  Package2, TrendingUp, Globe2, RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";

type Product = {
  id: string;
  name: string;
  url: string | null;
  image_url: string | null;
  selling_price: number | null;
  cog: number;
  source_url: string | null;
  created_at: string;
};

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "৳" + Number(n).toLocaleString("en-BD", { minimumFractionDigits: 0 });
}

function margin(selling: number | null, cog: number) {
  if (!selling || selling === 0) return null;
  return (((selling - cog) / selling) * 100).toFixed(1);
}

export default function Products() {
  const qc = useQueryClient();
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawlStatus, setCrawlStatus] = useState<"idle" | "crawling" | "done" | "error">("idle");
  const [crawlMsg, setCrawlMsg] = useState("");
  const [cogEdits, setCogEdits] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{ products: Product[] }>({
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

  // Derived totals
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

  async function saveCog(product: Product) {
    const raw = cogEdits[product.id];
    if (raw === undefined) return;
    const cog = parseFloat(raw) || 0;
    setSavingIds((s) => new Set(s).add(product.id));
    try {
      const res = await apiFetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cog }),
      });
      if (!res.ok) throw new Error("Save failed");
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      setCogEdits((e) => { const n = { ...e }; delete n[product.id]; return n; });
      toast.success("COG updated");
    } catch {
      toast.error("Failed to save COG");
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
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-[1800px] mx-auto px-6 py-8 space-y-4">

        {/* ── Summary panel ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="border border-black/[0.07] bg-white"
        >
          {/* Header row */}
          <div className="flex items-center justify-between px-8 py-3 border-b border-black/[0.05]">
            <div className="flex items-center gap-2.5">
              <Package2 className="h-3 w-3 text-black" />
              <span className="text-[8px] font-medium tracking-[0.3em] text-black uppercase">Product Catalogue</span>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="flex items-center gap-1.5 h-7 px-2 text-[9px] font-medium tracking-[0.18em] uppercase text-black hover:text-black transition-colors disabled:opacity-30"
              data-testid="button-refresh-products"
              title="Refresh"
            >
              {isLoading
                ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                : <RefreshCw className="h-2.5 w-2.5" />}
            </button>
          </div>

          {/* Stats cells */}
          <div className="flex">
            <div className="flex-1 px-8 py-5 border-r border-black/[0.05]">
              <div className="flex items-start justify-between">
                <p className="text-[8px] font-medium tracking-[0.25em] text-black uppercase mb-2">Total Products</p>
                <Package2 className="h-3 w-3 text-black mt-0.5" />
              </div>
              {isLoading
                ? <div className="h-7 w-12 bg-black/[0.04] animate-pulse" />
                : <p className="text-2xl font-light tracking-tight text-black tabular-nums">{totalProducts}</p>}
              <p className="text-[9px] text-black mt-1 tracking-wide">In catalogue</p>
            </div>

            <div className="flex-1 px-8 py-5 border-r border-black/[0.05]">
              <div className="flex items-start justify-between">
                <p className="text-[8px] font-medium tracking-[0.25em] text-black uppercase mb-2">Avg. Margin</p>
                <TrendingUp className="h-3 w-3 text-black mt-0.5" />
              </div>
              {isLoading
                ? <div className="h-7 w-16 bg-black/[0.04] animate-pulse" />
                : <p className={cn("text-2xl font-light tracking-tight tabular-nums",
                    avgMargin == null ? "text-black"
                    : parseFloat(avgMargin) > 40 ? "text-emerald-600"
                    : parseFloat(avgMargin) > 20 ? "text-black"
                    : "text-red-500"
                  )}>
                    {avgMargin != null ? `${avgMargin}%` : "—"}
                  </p>}
              <p className="text-[9px] text-black mt-1 tracking-wide">Selling price – COG</p>
            </div>

            <div className="flex-1 px-8 py-5">
              <div className="flex items-start justify-between">
                <p className="text-[8px] font-medium tracking-[0.25em] text-black uppercase mb-2">Total COG Value</p>
                <Package2 className="h-3 w-3 text-black mt-0.5" />
              </div>
              {isLoading
                ? <div className="h-7 w-20 bg-black/[0.04] animate-pulse" />
                : <p className="text-2xl font-light tracking-tight text-black tabular-nums">{fmt(totalCogValue)}</p>}
              <p className="text-[9px] text-black mt-1 tracking-wide">Sum of all COG</p>
            </div>
          </div>
        </motion.div>

        {/* ── Crawl panel ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="border border-black/[0.07] bg-white"
        >
          <div className="flex items-center gap-2.5 px-8 py-3 border-b border-black/[0.05]">
            <Globe2 className="h-3 w-3 text-black" />
            <span className="text-[8px] font-medium tracking-[0.3em] text-black uppercase">Import from Website</span>
          </div>

          <div className="px-8 py-5 space-y-3">
            <p className="text-[10px] text-black tracking-wide">
              Paste your store URL — AI will extract all products automatically.
            </p>
            <div className="flex gap-2 items-center">
              <input
                data-testid="input-crawl-url"
                type="url"
                placeholder="https://yourstore.com"
                value={crawlUrl}
                onChange={(e) => setCrawlUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !isCrawling && handleCrawl()}
                className="flex-1 h-8 px-3 text-[11px] font-mono border border-black/[0.10] bg-transparent text-black placeholder:text-black outline-none focus:border-black/30 transition-colors"
              />
              <button
                data-testid="button-crawl"
                onClick={handleCrawl}
                disabled={isCrawling || !crawlUrl.trim()}
                className="flex items-center gap-2 h-8 px-5 bg-black text-white text-[9px] font-medium tracking-[0.2em] uppercase hover:bg-black/80 transition-colors disabled:opacity-30"
              >
                {isCrawling
                  ? <><Loader2 className="h-3 w-3 animate-spin" />Extracting</>
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
                    : "text-black"
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
            className="border border-black/[0.07] bg-white"
          >
            {/* Table header */}
            <div className="flex items-center justify-between px-8 py-3 border-b border-black/[0.05]">
              <span className="text-[8px] font-medium tracking-[0.3em] text-black uppercase">
                Products · {products.length}
              </span>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-20 text-black">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-[10px] tracking-widest uppercase">Loading</span>
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 space-y-2">
                <PackageSearch className="h-8 w-8 text-black/[0.08]" />
                <p className="text-[9px] tracking-[0.3em] uppercase text-black">No products yet</p>
                <p className="text-[10px] text-black">Paste a store URL above to import products</p>
              </div>
            ) : (
              <>
                {/* Column labels */}
                <div className="grid grid-cols-[52px_1fr_130px_160px_100px_52px] gap-0 border-b border-black/[0.04]">
                  {["", "Product", "Selling Price", "COG", "Margin", ""].map((h, i) => (
                    <div key={i} className={cn("px-4 py-2.5", i === 0 ? "pl-8" : i === 5 ? "pr-4" : "")}>
                      <span className="text-[7px] font-medium tracking-[0.3em] uppercase text-black">{h}</span>
                    </div>
                  ))}
                </div>

                <AnimatePresence>
                  {products.map((product, idx) => {
                    const cogVal = cogEdits[product.id] ?? String(product.cog ?? 0);
                    const cogNum = parseFloat(cogVal) || 0;
                    const mgn = margin(product.selling_price, cogNum);
                    const isDirty = cogEdits[product.id] !== undefined;
                    const isSaving = savingIds.has(product.id);

                    return (
                      <motion.div
                        key={product.id}
                        data-testid={`row-product-${product.id}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15, delay: idx * 0.02 }}
                        className="grid grid-cols-[52px_1fr_130px_160px_100px_52px] gap-0 border-b border-black/[0.04] last:border-0 group hover:bg-black/[0.01] transition-colors"
                      >
                        {/* Image */}
                        <div className="pl-8 py-3.5 flex items-center">
                          <div className="size-8 overflow-hidden bg-black/[0.03] shrink-0">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package2 className="h-3.5 w-3.5 text-black" />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Name + URL */}
                        <div className="px-4 py-3.5 flex flex-col justify-center min-w-0">
                          <p data-testid={`text-product-name-${product.id}`}
                            className="text-[11px] font-medium text-black truncate leading-none">
                            {product.name}
                          </p>
                          {product.url && (
                            <a
                              href={product.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid={`link-product-${product.id}`}
                              className="flex items-center gap-1 text-[9px] text-black hover:text-black transition-colors mt-1 truncate"
                            >
                              <Link2 className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{product.url.replace(/^https?:\/\//, "").substring(0, 45)}</span>
                            </a>
                          )}
                        </div>

                        {/* Selling price */}
                        <div className="px-4 py-3.5 flex items-center">
                          <span data-testid={`text-selling-price-${product.id}`}
                            className="text-[11px] text-black font-mono tabular-nums">
                            {fmt(product.selling_price)}
                          </span>
                        </div>

                        {/* COG input */}
                        <div className="px-4 py-3.5 flex items-center gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-black pointer-events-none">৳</span>
                            <input
                              data-testid={`input-cog-${product.id}`}
                              type="number"
                              min={0}
                              value={cogVal}
                              onChange={(e) => setCogEdits((prev) => ({ ...prev, [product.id]: e.target.value }))}
                              onKeyDown={(e) => e.key === "Enter" && isDirty && saveCog(product)}
                              className="w-full h-7 pl-6 pr-2 text-[11px] font-mono border border-black/[0.10] bg-transparent text-black outline-none focus:border-black/30 transition-colors tabular-nums"
                            />
                          </div>
                          {isDirty && (
                            <button
                              data-testid={`button-save-cog-${product.id}`}
                              onClick={() => saveCog(product)}
                              disabled={isSaving}
                              className="h-7 px-2.5 bg-black text-white text-[9px] tracking-widest uppercase hover:bg-black/80 transition-colors disabled:opacity-40 shrink-0"
                            >
                              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            </button>
                          )}
                        </div>

                        {/* Margin */}
                        <div className="px-4 py-3.5 flex items-center">
                          <span
                            data-testid={`text-margin-${product.id}`}
                            className={cn("text-[11px] font-mono tabular-nums",
                              mgn == null ? "text-black"
                              : parseFloat(mgn) > 40 ? "text-emerald-600"
                              : parseFloat(mgn) > 20 ? "text-black"
                              : "text-red-500"
                            )}
                          >
                            {mgn != null ? `${mgn}%` : "—"}
                          </span>
                        </div>

                        {/* Delete */}
                        <div className="pr-4 py-3.5 flex items-center justify-end">
                          <button
                            data-testid={`button-delete-product-${product.id}`}
                            onClick={() => deleteMutation.mutate(product.id)}
                            className="p-1 text-black hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
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
