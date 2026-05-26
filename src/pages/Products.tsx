import { useState, useRef, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, SlidersHorizontal, Trash2, PackageSearch,
  Package2, Globe2, RefreshCw, Plus, X,
  Check, AlertTriangle, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import { useUserRole } from "@/hooks/useUserRole";

// ── Design tokens ─────────────────────────────────────────────────────────────
// Apple-style: pure white surfaces, SF-system font stack, razor-thin borders,
// no shadows on content panels, generous whitespace, monochrome palette.
// Every editable numeric cell uses the same h-9 w-full input.

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductVariant = {
  id: string;
  product_id: string;
  attributes: Record<string, string>;
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

type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SYS = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "৳" + Number(n).toLocaleString("en-BD", { minimumFractionDigits: 0 });
}

function pct(selling: number | null, cog: number) {
  if (!selling || selling === 0) return null;
  return (((selling - cog) / selling) * 100).toFixed(1);
}

function stockStatus(qty: number): "out" | "low" | "ok" {
  if (qty === 0) return "out";
  if (qty <= 5) return "low";
  return "ok";
}

function effectiveStock(p: Product): number {
  if (p.variants.length > 0) return p.variants.reduce((s, v) => s + v.stock_quantity, 0);
  return p.stock_quantity;
}

function attrLabel(a: Record<string, string>): string {
  return Object.values(a).filter(Boolean).join(" · ");
}

// ── Shared input class — every numeric cell uses this exact height/width ──────
// h-9 = 36 px, fully uniform across Price, COG, Stock columns
const INPUT_CLS =
  "h-9 w-full rounded-xl border border-black/[0.09] bg-[#F5F5F7] px-3 font-mono text-[13px] text-foreground outline-none tabular-nums transition-colors focus:border-black/25 focus:bg-white focus:ring-0 placeholder:text-black/25";

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent,
}: { label: string; value: React.ReactNode; sub: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-1 px-7 py-5">
      <p className="text-[11px] font-medium tracking-[0.06em] uppercase text-[#86868B]" style={{ fontFamily: SYS }}>
        {label}
      </p>
      <p className={cn("text-[28px] font-light leading-none tabular-nums tracking-tight", accent ?? "text-[#1D1D1F]")}
        style={{ fontFamily: SYS }}>
        {value}
      </p>
      <p className="text-[12px] text-[#86868B]" style={{ fontFamily: SYS }}>{sub}</p>
    </div>
  );
}

// ── Variant chip + click-to-edit popover ──────────────────────────────────────

function VariantChip({
  variant, productId, isAdmin,
}: { variant: ProductVariant; productId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [stockDraft, setStockDraft] = useState(String(variant.stock_quantity));
  const [cogDraft, setCogDraft] = useState(String(variant.cog));
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const status = stockStatus(variant.stock_quantity);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 60); }, [open]);
  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setStockDraft(String(variant.stock_quantity));
        setCogDraft(String(variant.cog));
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open, variant.stock_quantity, variant.cog]);

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { stock_quantity: Math.max(0, parseInt(stockDraft, 10) || 0) };
      if (isAdmin) body.cog = parseFloat(cogDraft) || 0;
      const res = await apiFetch(`/api/products/${productId}/variants/${variant.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      setOpen(false);
      toast.success("Variant saved");
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  }

  async function del() {
    try {
      const res = await apiFetch(`/api/products/${productId}/variants/${variant.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      toast.success("Variant removed");
    } catch { toast.error("Failed to remove variant"); }
  }

  const chipCls = cn(
    "inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[11px] font-medium leading-none transition-all",
    status === "out" && "bg-[#FFF2F2] text-[#FF3B30] ring-1 ring-inset ring-[#FF3B30]/20",
    status === "low" && "bg-[#FFF8EC] text-[#FF9500] ring-1 ring-inset ring-[#FF9500]/25",
    status === "ok"  && "bg-[#F5F5F7] text-[#1D1D1F] ring-1 ring-inset ring-black/[0.07]",
    open && "ring-2 ring-[#0071E3]"
  );

  return (
    <div className="relative inline-block" ref={ref}>
      <button className={chipCls} onClick={() => setOpen(v => !v)}>
        <span className={cn("h-[5px] w-[5px] rounded-full shrink-0",
          status === "out" && "bg-[#FF3B30]",
          status === "low" && "bg-[#FF9500]",
          status === "ok"  && "bg-[#34C759]"
        )} />
        <span style={{ fontFamily: SYS }}>{attrLabel(variant.attributes)}</span>
        <span className="opacity-30">·</span>
        <span className="tabular-nums" style={{ fontFamily: SYS }}>
          {status === "out" ? "Out" : variant.stock_quantity}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.14, ease: [0.36, 0.66, 0.04, 1] }}
            className="absolute left-0 top-full z-50 mt-2 w-60 rounded-2xl border border-black/[0.08] bg-white p-4 shadow-2xl shadow-black/[0.10]"
            style={{ fontFamily: SYS }}
          >
            {/* Attribute tags */}
            <div className="mb-3 flex flex-wrap gap-1">
              {Object.entries(variant.attributes).map(([k, v]) => (
                <span key={k} className="rounded-lg bg-[#F5F5F7] px-2 py-0.5 text-[11px] text-[#1D1D1F]">
                  <span className="text-[#86868B]">{k}:</span> {v}
                </span>
              ))}
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-[#86868B]">Stock</label>
                <input ref={inputRef} type="number" min={0} value={stockDraft}
                  onChange={e => setStockDraft(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && save()}
                  className={cn(INPUT_CLS, "h-9")} />
              </div>
              {isAdmin && (
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-[#86868B]">Cost (৳)</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#86868B]">৳</span>
                    <input type="number" min={0} value={cogDraft}
                      onChange={e => setCogDraft(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && save()}
                      className={cn(INPUT_CLS, "h-9 pl-7")} />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button onClick={save} disabled={saving}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0071E3] text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40">
                {saving ? <Spinner size="sm" /> : <><Check className="h-3 w-3" />Save</>}
              </button>
              <button onClick={del}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#86868B] transition-colors hover:bg-[#FFF2F2] hover:text-[#FF3B30]">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Variant chips strip ───────────────────────────────────────────────────────

const CHIPS_MAX = 3;

function VariantStrip({
  product, isAdmin, onAdd,
}: { product: Product; isAdmin: boolean; onAdd: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const { variants } = product;
  const overflow = variants.length - CHIPS_MAX;
  const visible = showAll ? variants : variants.slice(0, CHIPS_MAX);
  const hasAlert = variants.some(v => stockStatus(v.stock_quantity) !== "ok");

  if (variants.length === 0) {
    return (
      <button onClick={onAdd}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-black/[0.15] px-3 py-[5px] text-[11px] text-[#86868B] transition-colors hover:border-black/30 hover:text-[#1D1D1F]"
        style={{ fontFamily: SYS }}>
        <Plus className="h-3 w-3" /> Add variants
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map(v => (
        <VariantChip key={v.id} variant={v} productId={product.id} isAdmin={isAdmin} />
      ))}
      {!showAll && overflow > 0 && (
        <button onClick={() => setShowAll(true)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-[5px] text-[11px] font-medium ring-1 ring-inset transition-colors",
            hasAlert
              ? "bg-[#FFF8EC] text-[#FF9500] ring-[#FF9500]/25 hover:bg-[#FFF0D6]"
              : "bg-[#F5F5F7] text-[#86868B] ring-black/[0.07] hover:text-[#1D1D1F]"
          )} style={{ fontFamily: SYS }}>
          {hasAlert && <AlertTriangle className="h-2.5 w-2.5" />}
          +{overflow}
        </button>
      )}
      {showAll && overflow > 0 && (
        <button onClick={() => setShowAll(false)}
          className="rounded-full bg-[#F5F5F7] px-2.5 py-[5px] text-[11px] text-[#86868B] ring-1 ring-inset ring-black/[0.07] hover:text-[#1D1D1F]"
          style={{ fontFamily: SYS }}>
          Less
        </button>
      )}
      <button onClick={onAdd}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-black/[0.15] text-[#86868B] transition-colors hover:border-black/30 hover:text-[#1D1D1F]">
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── Add-variant drawer ────────────────────────────────────────────────────────

function AddVariantDrawer({
  product, isAdmin, onClose,
}: { product: Product; isAdmin: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState([{ key: "", value: "" }]);
  const [stock, setStock] = useState("0");
  const [cog, setCog] = useState("0");
  const [priceAdj, setPriceAdj] = useState("0");
  const [saving, setSaving] = useState(false);

  function setRow(i: number, f: "key" | "value", v: string) {
    setRows(r => r.map((x, j) => j === i ? { ...x, [f]: v } : x));
  }

  async function submit() {
    const attrs: Record<string, string> = {};
    for (const r of rows) {
      const k = r.key.trim().toLowerCase(), v = r.value.trim();
      if (k && v) attrs[k] = v;
    }
    if (!Object.keys(attrs).length) {
      toast.error("Add at least one attribute (e.g. color: Black)");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/products/${product.id}/variants`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attributes: attrs,
          stock_quantity: Math.max(0, parseInt(stock, 10) || 0),
          cog: parseFloat(cog) || 0,
          price_adjustment: parseFloat(priceAdj) || 0,
        }),
      });
      if (!res.ok) throw new Error();
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      toast.success("Variant added");
      onClose();
    } catch { toast.error("Failed to add variant"); }
    finally { setSaving(false); }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: [0.36, 0.66, 0.04, 1] }}
      className="overflow-hidden border-t border-black/[0.06] bg-[#FAFAFA]"
      style={{ fontFamily: SYS }}
    >
      <div className="px-6 py-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868B]">
            Add Variant — <span className="text-[#1D1D1F]">{product.name}</span>
          </p>
          <button onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[#86868B] transition-colors hover:bg-black/[0.06]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          {/* Dynamic attribute builder */}
          <div className="flex-1 space-y-2">
            <p className="text-[11px] font-medium text-[#86868B]">
              Attributes&nbsp;
              <span className="font-normal text-[#ADADB8]">— any key / value combination</span>
            </p>
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="attribute (color, weight…)"
                    value={row.key}
                    onChange={e => setRow(i, "key", e.target.value)}
                    className={cn(INPUT_CLS, "h-9 w-36 shrink-0")}
                  />
                  <span className="text-[12px] text-[#ADADB8] shrink-0">:</span>
                  <input
                    type="text"
                    placeholder="value"
                    value={row.value}
                    onChange={e => setRow(i, "value", e.target.value)}
                    className={cn(INPUT_CLS, "h-9 flex-1")}
                  />
                  {rows.length > 1 && (
                    <button onClick={() => setRows(r => r.filter((_, j) => j !== i))}
                      className="shrink-0 rounded-lg p-1 text-[#86868B] hover:text-[#FF3B30]">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setRows(r => [...r, { key: "", value: "" }])}
              className="flex items-center gap-1.5 text-[12px] text-[#0071E3] hover:opacity-75 transition-opacity">
              <Plus className="h-3 w-3" /> Add attribute
            </button>
          </div>

          {/* Numeric fields — all h-9, identical styling */}
          <div className="flex flex-wrap items-end gap-3 lg:flex-nowrap">
            <div className="w-[104px] space-y-1.5">
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-[#86868B]">Stock</label>
              <input type="number" min={0} value={stock}
                onChange={e => setStock(e.target.value)}
                className={cn(INPUT_CLS, "h-9")} />
            </div>
            {isAdmin && (
              <>
                <div className="w-[104px] space-y-1.5">
                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-[#86868B]">Cost (৳)</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#86868B]">৳</span>
                    <input type="number" min={0} value={cog}
                      onChange={e => setCog(e.target.value)}
                      className={cn(INPUT_CLS, "h-9 pl-7")} />
                  </div>
                </div>
                <div className="w-[104px] space-y-1.5">
                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-[#86868B]">Price ±</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#86868B]">৳</span>
                    <input type="number" value={priceAdj}
                      onChange={e => setPriceAdj(e.target.value)}
                      className={cn(INPUT_CLS, "h-9 pl-7")} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button onClick={submit} disabled={saving}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-[#1D1D1F] px-5 text-[13px] font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-40">
            {saving ? <Spinner size="sm" /> : <Plus className="h-3.5 w-3.5" />}
            Add variant
          </button>
          <button onClick={onClose}
            className="h-9 rounded-xl border border-black/[0.09] bg-[#F5F5F7] px-4 text-[13px] font-medium text-[#86868B] transition-colors hover:text-[#1D1D1F]">
            Cancel
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

  // Search + filter
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Import
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawlStatus, setCrawlStatus] = useState<"idle" | "crawling" | "done" | "error">("idle");
  const [crawlMsg, setCrawlMsg] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  // Inline edits
  const [cogEdits, setCogEdits] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [addingFor, setAddingFor] = useState<string | null>(null);

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!filterOpen) return;
    const fn = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [filterOpen]);

  const { data, isLoading, refetch } = useQuery<{ products: Product[] }>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await apiFetch("/api/products");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      return res.json();
    },
  });

  const allProducts = data?.products ?? [];

  // Derived stats (always from full list)
  const totalProducts = allProducts.length;
  const avgMargin = (() => {
    const wp = allProducts.filter(p => p.selling_price && p.selling_price > 0);
    if (!wp.length) return null;
    return (wp.reduce((a, p) => a + ((p.selling_price! - p.cog) / p.selling_price!) * 100, 0) / wp.length).toFixed(1);
  })();
  const totalStock = allProducts.reduce((a, p) => a + effectiveStock(p), 0);
  const outCount = allProducts.reduce((a, p) => {
    if (p.variants.length > 0) return a + p.variants.filter(v => v.stock_quantity === 0).length;
    return a + (p.stock_quantity === 0 ? 1 : 0);
  }, 0);
  const totalCog = allProducts.reduce((a, p) => a + (p.cog || 0), 0);

  // Filtered list
  const products = useMemo(() => {
    let list = allProducts;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.url ?? "").toLowerCase().includes(q) ||
        p.variants.some(v => attrLabel(v.attributes).toLowerCase().includes(q))
      );
    }
    if (stockFilter !== "all") {
      list = list.filter(p => {
        const s = stockStatus(effectiveStock(p));
        if (stockFilter === "in_stock")    return s === "ok";
        if (stockFilter === "low_stock")   return s === "low";
        if (stockFilter === "out_of_stock") return s === "out";
        return true;
      });
    }
    return list;
  }, [allProducts, query, stockFilter]);

  async function saveProducts(prods: unknown[], sourceUrl: string) {
    const res = await apiFetch("/api/products/save", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products: prods, sourceUrl }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Save failed");
    await qc.invalidateQueries({ queryKey: ["/api/products"] });
    setCrawlStatus("done");
    setCrawlMsg(`${json.saved} product${json.saved !== 1 ? "s" : ""} imported.`);
    toast.success(`${json.saved} products imported`);
  }

  async function handleCrawl() {
    if (!crawlUrl.trim()) return;
    setCrawlStatus("crawling"); setCrawlMsg("");
    try {
      const res = await apiFetch("/api/products/crawl", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: crawlUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Crawl failed");
      if (json.products?.length) await saveProducts(json.products, crawlUrl.trim());
      else { setCrawlStatus("done"); setCrawlMsg("No products found."); }
    } catch (e: unknown) {
      setCrawlStatus("error");
      setCrawlMsg(e instanceof Error ? e.message : "Crawl failed");
    }
  }

  async function saveCog(product: Product) {
    if (cogEdits[product.id] === undefined) return;
    setSavingIds(s => new Set(s).add(product.id));
    try {
      const res = await apiFetch(`/api/products/${product.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cog: parseFloat(cogEdits[product.id]) || 0 }),
      });
      if (!res.ok) throw new Error();
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      setCogEdits(e => { const n = { ...e }; delete n[product.id]; return n; });
      toast.success("COG updated");
    } catch { toast.error("Failed to save"); }
    finally { setSavingIds(s => { const n = new Set(s); n.delete(product.id); return n; }); }
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/products"] }); toast.success("Removed"); },
    onError: () => toast.error("Failed to delete"),
  });

  const FILTER_LABELS: Record<StockFilter, string> = {
    all: "All", in_stock: "In stock", low_stock: "Low stock", out_of_stock: "Out of stock",
  };

  // Column grid — fixed equal-width numeric columns for visual alignment
  const GRID = isAdmin
    ? "grid-cols-[52px_minmax(180px,1fr)_minmax(220px,2fr)_120px_120px_84px_44px]"
    : "grid-cols-[52px_minmax(180px,1fr)_minmax(220px,2fr)_120px_84px_44px]";

  return (
    <div className="min-h-full bg-[#F5F5F7]" style={{ fontFamily: SYS }}>
      <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-4 lg:px-6 lg:py-5">

        {/* ── Stats bar ── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white"
        >
          <div className="grid divide-y divide-black/[0.05] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            <StatCard label="Products" value={isLoading ? <span className="inline-block h-7 w-10 animate-pulse rounded-lg bg-black/[0.05]" /> : totalProducts} sub="In catalogue" />
            <StatCard
              label="Avg Margin"
              value={isLoading ? <span className="inline-block h-7 w-14 animate-pulse rounded-lg bg-black/[0.05]" /> : (avgMargin ? `${avgMargin}%` : "—")}
              sub="Selling price − cost"
              accent={avgMargin ? (parseFloat(avgMargin) > 40 ? "text-[#34C759]" : parseFloat(avgMargin) > 20 ? "text-[#1D1D1F]" : "text-[#FF3B30]") : undefined}
            />
            <StatCard label="Total Stock" value={isLoading ? <span className="inline-block h-7 w-16 animate-pulse rounded-lg bg-black/[0.05]" /> : totalStock.toLocaleString("en-BD")} sub="Units available" />
            <StatCard
              label="Out of Stock"
              value={isLoading ? <span className="inline-block h-7 w-8 animate-pulse rounded-lg bg-black/[0.05]" /> : outCount}
              sub="Variants / products"
              accent={outCount > 0 ? "text-[#FF3B30]" : "text-[#1D1D1F]"}
            />
          </div>
          <div className="border-t border-black/[0.05] px-7 py-2.5">
            <span className="text-[12px] text-[#86868B]">
              Total cost value: <span className="font-medium text-[#1D1D1F]">{fmt(totalCog)}</span>
            </span>
          </div>
        </motion.div>

        {/* ── Main card ── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white"
        >
          {/* ── Toolbar ── */}
          <div className="flex flex-col gap-3 border-b border-black/[0.06] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: title */}
            <div className="flex items-center gap-2.5">
              <Package2 className="h-4 w-4 text-[#86868B]" />
              <span className="text-[15px] font-semibold text-[#1D1D1F]">Products</span>
              {!isLoading && (
                <span className="rounded-full bg-[#F5F5F7] px-2 py-0.5 text-[11px] font-medium text-[#86868B]">
                  {products.length}{products.length !== allProducts.length && `/${allProducts.length}`}
                </span>
              )}
            </div>

            {/* Right: search + filter + import + refresh */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#ADADB8]" />
                <input
                  type="text"
                  placeholder="Search products…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  className="h-9 w-52 rounded-xl border border-black/[0.09] bg-[#F5F5F7] pl-9 pr-3 text-[13px] text-[#1D1D1F] outline-none transition-all placeholder:text-[#ADADB8] focus:border-black/20 focus:bg-white focus:w-64"
                />
                {query && (
                  <button onClick={() => setQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#ADADB8] hover:text-[#1D1D1F]">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Stock filter dropdown */}
              <div className="relative" ref={filterRef}>
                <button
                  onClick={() => setFilterOpen(v => !v)}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-medium transition-colors",
                    stockFilter !== "all"
                      ? "border-[#0071E3]/30 bg-[#EBF4FF] text-[#0071E3]"
                      : "border-black/[0.09] bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F]"
                  )}>
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  {FILTER_LABELS[stockFilter]}
                  <ChevronDown className={cn("h-3 w-3 transition-transform", filterOpen && "rotate-180")} />
                </button>
                <AnimatePresence>
                  {filterOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.97 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 top-full z-40 mt-1.5 w-44 overflow-hidden rounded-xl border border-black/[0.08] bg-white py-1 shadow-xl shadow-black/[0.08]"
                    >
                      {(["all", "in_stock", "low_stock", "out_of_stock"] as StockFilter[]).map(f => (
                        <button key={f}
                          onClick={() => { setStockFilter(f); setFilterOpen(false); }}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-[13px] transition-colors hover:bg-[#F5F5F7]",
                            stockFilter === f ? "font-semibold text-[#0071E3]" : "text-[#1D1D1F]"
                          )}>
                          <span className={cn("h-2 w-2 rounded-full",
                            f === "in_stock"    && "bg-[#34C759]",
                            f === "low_stock"   && "bg-[#FF9500]",
                            f === "out_of_stock" && "bg-[#FF3B30]",
                            f === "all"         && "bg-[#ADADB8]"
                          )} />
                          {FILTER_LABELS[f]}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Import from URL */}
              <button
                onClick={() => setImportOpen(v => !v)}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-medium transition-colors",
                  importOpen
                    ? "border-[#0071E3]/30 bg-[#EBF4FF] text-[#0071E3]"
                    : "border-black/[0.09] bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F]"
                )}>
                <Globe2 className="h-3.5 w-3.5" />
                Import
              </button>

              {/* Refresh */}
              <button
                onClick={() => refetch()}
                disabled={isLoading}
                data-testid="button-refresh-products"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.09] bg-[#F5F5F7] text-[#86868B] transition-colors hover:text-[#1D1D1F] disabled:opacity-30">
                {isLoading ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* ── Import bar (collapsible) ── */}
          <AnimatePresence>
            {importOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-b border-black/[0.06] bg-[#FAFAFA]"
              >
                <div className="flex flex-col gap-2.5 px-5 py-4 sm:flex-row sm:items-center">
                  <input
                    data-testid="input-crawl-url"
                    type="url"
                    placeholder="https://yourstore.com — AI extracts products automatically"
                    value={crawlUrl}
                    onChange={e => setCrawlUrl(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && crawlStatus !== "crawling" && handleCrawl()}
                    className={cn(INPUT_CLS, "h-9 flex-1")}
                  />
                  <button
                    data-testid="button-crawl"
                    onClick={handleCrawl}
                    disabled={crawlStatus === "crawling" || !crawlUrl.trim()}
                    className="flex h-9 shrink-0 items-center gap-2 rounded-xl bg-[#1D1D1F] px-5 text-[13px] font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-30"
                  >
                    {crawlStatus === "crawling" ? <><Spinner size="sm" />Extracting…</> : <><RefreshCw className="h-3.5 w-3.5" />Extract</>}
                  </button>
                  {crawlMsg && (
                    <span className={cn("shrink-0 text-[12px]",
                      crawlStatus === "error" ? "text-[#FF3B30]" : "text-[#34C759]")}>
                      {crawlMsg}
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Table ── */}
          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-[#86868B]">
              <Spinner className="mr-2.5" />
              <span className="text-[14px]">Loading products…</span>
            </div>
          ) : allProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F5F5F7]">
                <PackageSearch className="h-7 w-7 text-[#ADADB8]" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-[15px] font-semibold text-[#1D1D1F]">No products yet</p>
                <p className="text-[13px] text-[#86868B] max-w-xs">
                  Use the Import button above to extract products from your store URL.
                </p>
              </div>
              <button onClick={() => setImportOpen(true)}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-[#0071E3] px-5 text-[13px] font-medium text-white transition-opacity hover:opacity-85">
                <Globe2 className="h-3.5 w-3.5" /> Import products
              </button>
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <Search className="h-8 w-8 text-[#ADADB8]" />
              <p className="text-[14px] font-medium text-[#1D1D1F]">No results for "{query || FILTER_LABELS[stockFilter]}"</p>
              <button onClick={() => { setQuery(""); setStockFilter("all"); }}
                className="text-[13px] text-[#0071E3] hover:opacity-75 transition-opacity">
                Clear filters
              </button>
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div className={cn("grid border-b border-black/[0.05] bg-[#FAFAFA]", GRID)}>
                {(isAdmin
                  ? ["", "Product", "Variants", "Price", "Cost", "Margin", ""]
                  : ["", "Product", "Variants", "Price", "Margin", ""]
                ).map((h, i) => (
                  <div key={i} className={cn("px-4 py-2.5", i === 0 && "pl-5")}>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#86868B]">{h}</span>
                  </div>
                ))}
              </div>

              <AnimatePresence>
                {products.map((product, idx) => {
                  const cogVal = cogEdits[product.id] ?? String(product.cog ?? 0);
                  const mgn = pct(product.selling_price, parseFloat(cogVal) || 0);
                  const isDirty = cogEdits[product.id] !== undefined;
                  const isSaving = savingIds.has(product.id);
                  const isAdding = addingFor === product.id;
                  const stock = effectiveStock(product);
                  const ss = stockStatus(stock);

                  return (
                    <motion.div
                      key={product.id}
                      data-testid={`row-product-${product.id}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12, delay: idx * 0.012 }}
                    >
                      {/* Row */}
                      <div className={cn(
                        "group grid items-center border-b border-black/[0.04] transition-colors last:border-0 hover:bg-[#FAFAFA]",
                        GRID, isAdding && "bg-[#FAFAFA]"
                      )}>

                        {/* Thumbnail */}
                        <div className="flex items-center py-4 pl-5">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-[#F5F5F7]">
                            {product.image_url
                              ? <img src={product.image_url} alt={product.name}
                                  className="h-full w-full object-cover"
                                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              : <div className="flex h-full w-full items-center justify-center">
                                  <Package2 className="h-4 w-4 text-[#ADADB8]" />
                                </div>
                            }
                          </div>
                        </div>

                        {/* Name + URL + stock dot (no-variant) */}
                        <div className="flex min-w-0 flex-col gap-0.5 px-4 py-4">
                          <p data-testid={`text-product-name-${product.id}`}
                            className="truncate text-[13px] font-medium text-[#1D1D1F]">
                            {product.name}
                          </p>
                          {product.url && (
                            <a href={product.url} target="_blank" rel="noopener noreferrer"
                              data-testid={`link-product-${product.id}`}
                              className="flex items-center gap-1 truncate text-[11px] text-[#ADADB8] transition-colors hover:text-[#86868B]">
                              <span className="truncate">{product.url.replace(/^https?:\/\//, "").substring(0, 42)}</span>
                            </a>
                          )}
                          {product.variants.length === 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className={cn("h-[5px] w-[5px] rounded-full",
                                ss === "out" && "bg-[#FF3B30]",
                                ss === "low" && "bg-[#FF9500]",
                                ss === "ok"  && "bg-[#34C759]"
                              )} />
                              <span className={cn("text-[11px]",
                                ss === "out" && "text-[#FF3B30] font-medium",
                                ss === "low" && "text-[#FF9500] font-medium",
                                ss === "ok"  && "text-[#86868B]"
                              )}>
                                {ss === "out" ? "Out of stock" : `${stock} in stock`}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Variant chips */}
                        <div className="px-4 py-4">
                          <VariantStrip
                            product={product}
                            isAdmin={isAdmin}
                            onAdd={() => setAddingFor(isAdding ? null : product.id)}
                          />
                        </div>

                        {/* Price — read-only, uniform box */}
                        <div className="px-4 py-4">
                          <div className={cn(INPUT_CLS, "flex h-9 cursor-default items-center bg-transparent border-transparent text-[#1D1D1F]")}>
                            <span data-testid={`text-selling-price-${product.id}`}>
                              {fmt(product.selling_price)}
                            </span>
                          </div>
                        </div>

                        {/* COG — admin editable, same h-9 box */}
                        {isAdmin && (
                          <div className="flex items-center gap-1.5 px-4 py-4">
                            <div className="relative flex-1">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#ADADB8]">৳</span>
                              <input
                                data-testid={`input-cog-${product.id}`}
                                type="number" min={0} value={cogVal}
                                onChange={e => setCogEdits(p => ({ ...p, [product.id]: e.target.value }))}
                                onKeyDown={e => e.key === "Enter" && isDirty && saveCog(product)}
                                className={cn(INPUT_CLS, "h-9 pl-7")}
                              />
                            </div>
                            <AnimatePresence>
                              {isDirty && (
                                <motion.button
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.8 }}
                                  data-testid={`button-save-metrics-${product.id}`}
                                  onClick={() => saveCog(product)}
                                  disabled={isSaving}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1D1D1F] text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                                >
                                  {isSaving ? <Spinner size="sm" /> : <Check className="h-3.5 w-3.5" />}
                                </motion.button>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        {/* Margin */}
                        <div className="px-4 py-4">
                          <span
                            data-testid={`text-margin-${product.id}`}
                            className={cn("text-[13px] tabular-nums font-medium",
                              mgn == null ? "text-[#ADADB8]"
                              : parseFloat(mgn) > 40 ? "text-[#34C759]"
                              : parseFloat(mgn) > 20 ? "text-[#1D1D1F]"
                              : "text-[#FF3B30]"
                            )}>
                            {mgn != null ? `${mgn}%` : "—"}
                          </span>
                        </div>

                        {/* Delete */}
                        <div className="flex items-center justify-center py-4 pr-3">
                          <button
                            data-testid={`button-delete-product-${product.id}`}
                            onClick={() => deleteMutation.mutate(product.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-xl text-[#ADADB8] opacity-0 transition-all hover:bg-[#FFF2F2] hover:text-[#FF3B30] group-hover:opacity-100">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Add-variant drawer */}
                      <AnimatePresence>
                        {isAdding && (
                          <AddVariantDrawer
                            product={product}
                            isAdmin={isAdmin}
                            onClose={() => setAddingFor(null)}
                          />
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Footer legend */}
              <div className="flex items-center gap-5 border-t border-black/[0.05] px-6 py-3">
                {[
                  { dot: "bg-[#34C759]", label: "In stock" },
                  { dot: "bg-[#FF9500]", label: "Low (≤5)" },
                  { dot: "bg-[#FF3B30]", label: "Out of stock" },
                ].map(({ dot, label }) => (
                  <span key={label} className="flex items-center gap-1.5 text-[11px] text-[#86868B]">
                    <span className={cn("h-[6px] w-[6px] rounded-full", dot)} />
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
