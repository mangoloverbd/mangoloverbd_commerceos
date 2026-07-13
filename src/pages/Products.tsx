import { useState, useRef, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, SlidersHorizontal, Trash2, PackageSearch,
  Package2, Globe2, RefreshCw, Plus, X,
  Check, AlertTriangle, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import { PopButton } from "@/components/ui/pop-button";
import { BaseButton } from "@/components/base/buttons/button";
import { RichButton } from "@/components/ui/rich-button";
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

type ProductImage = {
  id: string;
  url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
};

type Product = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  url: string | null;
  image_url: string | null;
  selling_price: number | null;
  compare_at_price: number | null;
  cog: number;
  stock_quantity: number;
  source_url: string | null;
  published: boolean;
  published_at: string | null;
  created_at: string;
  variants: ProductVariant[];
  images: ProductImage[];
};

type ProductsResponse = {
  storefront?: {
    id: string;
    products_url: string;
  };
  products: Product[];
};

type ManualVariantDraft = {
  id: string;
  optionName: string;
  optionValue: string;
  stock: string;
  cog: string;
  priceAdjustment: string;
};

type SelectedImage = {
  id: string;
  file: File;
  dataUrl: string;
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

// ── Shared input class — every numeric cell uses this exact height/width ──────
// h-9 = 36 px, fully uniform — matches Settings page input style exactly
const INPUT_CLS =
  "h-9 w-full rounded-[12px] border border-black/[0.1] bg-black/[0.04] px-3 font-mono text-[13px] text-black outline-none tabular-nums transition-colors focus-visible:ring-1 focus-visible:ring-black/20 focus:bg-white placeholder:text-black/25";

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent,
}: { label: string; value: React.ReactNode; sub: string; accent?: string }) {
  return (
      <div className="flex flex-col min-w-0 overflow-hidden rounded-xl border border-black/[0.16] bg-white p-4 shadow-[0_1px_1px_0_rgba(0,0,0,0.04)]">
      <p className="text-[11px] font-medium uppercase tracking-wider text-black/50">
        {label}
      </p>
      <p
        className={cn("mt-1.5 text-2xl font-semibold tabular-nums tracking-tight", accent ?? "text-black")}
        style={{ fontFamily: SYS }}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[12px] text-black/40" style={{ fontFamily: SYS }}>{sub}</p>
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
    "inline-flex cursor-pointer select-none items-center gap-1.5 rounded-[12px] px-2.5 py-[5px] text-[11px] font-medium leading-none transition-all",
    status === "out" && "bg-red-50 text-red-600 ring-1 ring-inset ring-red-200",
    status === "low" && "bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200",
    status === "ok"  && "bg-[#E3E3E3]/80 shadow-[0_2px_4px_0_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.16),inset_0_1px_0_0_#FDFDFD] text-zinc-900 hover:bg-[#E3E3E3]",
    open && "ring-2 ring-black/30"
  );

  return (
    <div className="relative inline-block" ref={ref}>
      <button className={chipCls} onClick={() => setOpen(v => !v)}>
        <span className={cn("h-[5px] w-[5px] rounded-full shrink-0",
          status === "out" && "bg-red-500",
          status === "low" && "bg-amber-400",
          status === "ok"  && "bg-emerald-500"
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
            className="absolute left-0 top-full z-50 mt-2 w-60 rounded-[14px] border border-black/[0.08] bg-white p-4 shadow-sm"
            style={{ fontFamily: SYS }}
          >
            {/* Attribute tags */}
            <div className="mb-3 flex flex-wrap gap-1">
              {Object.entries(variant.attributes).map(([k, v]) => (
                <span key={k} className="rounded-lg bg-black/[0.04] px-2 py-0.5 text-[11px] text-black">
                  <span className="text-black/40">{k}:</span> {v}
                </span>
              ))}
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-black/40">Stock</label>
                <input ref={inputRef} type="number" min={0} value={stockDraft}
                  onChange={e => setStockDraft(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && save()}
                  className={cn(INPUT_CLS, "h-9")} />
              </div>
              {isAdmin && (
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-black/40">Cost (৳)</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-zinc-900">৳</span>
                    <input type="number" min={0} value={cogDraft}
                      onChange={e => setCogDraft(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && save()}
                      className="h-9 w-full rounded-[12px] pl-7 pr-3 font-mono text-[13px] outline-none tabular-nums focus-visible:ring-2 focus-visible:ring-black/20 bg-[#E3E3E3]/80 shadow-[0_2px_4px_0_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.16),inset_0_1px_0_0_#FDFDFD] text-zinc-900 transition-all hover:bg-[#E3E3E3]" />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button onClick={save} disabled={saving}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-black text-[12px] font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-40">
                {saving ? <Spinner size="sm" /> : <><Check className="h-3 w-3" />Save</>}
              </button>
              <button onClick={del}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-black/40 transition-colors hover:bg-red-50 hover:text-red-500">
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
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-black/[0.15] px-3 py-[5px] text-[11px] text-black/40 transition-colors hover:border-black/30 hover:text-black"
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
              ? "bg-amber-50 text-amber-600 ring-amber-200 hover:bg-amber-100"
              : "bg-black/[0.04] text-black/40 ring-black/[0.08] hover:text-black"
          )} style={{ fontFamily: SYS }}>
          {hasAlert && <AlertTriangle className="h-2.5 w-2.5" />}
          +{overflow}
        </button>
      )}
      {showAll && overflow > 0 && (
        <button onClick={() => setShowAll(false)}
          className="rounded-full bg-black/[0.04] px-2.5 py-[5px] text-[11px] text-black/40 ring-1 ring-inset ring-black/[0.08] hover:text-black"
          style={{ fontFamily: SYS }}>
          Less
        </button>
      )}
      <button onClick={onAdd}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-black/[0.15] text-black/40 transition-colors hover:border-black/30 hover:text-black">
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
      className="overflow-hidden border-t border-black/[0.06] bg-[#FAFAF8]"
      style={{ fontFamily: SYS }}
    >
      <div className="px-6 py-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-black/40">
            Add Variant — <span className="text-black">{product.name}</span>
          </p>
          <button onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full text-black/40 transition-colors hover:bg-black/[0.06]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          {/* Dynamic attribute builder */}
          <div className="flex-1 space-y-2">
            <p className="text-[11px] font-medium text-black/40">
              Attributes&nbsp;
              <span className="font-normal text-black/25">— any key / value combination</span>
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
                  <span className="text-[12px] text-black/25 shrink-0">:</span>
                  <input
                    type="text"
                    placeholder="value"
                    value={row.value}
                    onChange={e => setRow(i, "value", e.target.value)}
                    className={cn(INPUT_CLS, "h-9 flex-1")}
                  />
                  {rows.length > 1 && (
                    <button onClick={() => setRows(r => r.filter((_, j) => j !== i))}
                      className="shrink-0 rounded-lg p-1 text-black/40 hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setRows(r => [...r, { key: "", value: "" }])}
              className="flex items-center gap-1.5 text-[12px] text-black/40 hover:text-black transition-colors">
              <Plus className="h-3 w-3" /> Add attribute
            </button>
          </div>

          {/* Numeric fields — all h-9, identical styling */}
          <div className="flex flex-wrap items-end gap-3 lg:flex-nowrap">
            <div className="w-[104px] space-y-1.5">
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-black/40">Stock</label>
              <input type="number" min={0} value={stock}
                onChange={e => setStock(e.target.value)}
                className={cn(INPUT_CLS, "h-9")} />
            </div>
            {isAdmin && (
              <>
                <div className="w-[104px] space-y-1.5">
                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-black/40">Cost (৳)</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-black/40">৳</span>
                    <input type="number" min={0} value={cog}
                      onChange={e => setCog(e.target.value)}
                      className={cn(INPUT_CLS, "h-9 pl-7")} />
                  </div>
                </div>
                <div className="w-[104px] space-y-1.5">
                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-black/40">Price ±</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-black/40">৳</span>
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
          <PopButton
            color="blue"
            size="sm"
            type="button"
            onClick={submit}
            disabled={saving}
            className="gap-1.5 px-3 text-[11px] font-bold tracking-normal"
          >
            {saving ? <Spinner size="sm" /> : <Plus className="h-3.5 w-3.5" />}
            Add variant
          </PopButton>
          <PopButton
            color="default"
            size="sm"
            type="button"
            onClick={onClose}
            className="px-3 text-[11px] font-bold tracking-normal"
          >
            Cancel
          </PopButton>
        </div>
      </div>
    </motion.div>
  );
}

function AddProductDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [cog, setCog] = useState("");
  const [stock, setStock] = useState("");
  const [published, setPublished] = useState(false);
  const [variants, setVariants] = useState<ManualVariantDraft[]>([]);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [saving, setSaving] = useState(false);

  function addVariant() {
    setVariants((current) => [
      ...current,
      { id: crypto.randomUUID(), optionName: "Color", optionValue: "", stock: "0", cog: "0", priceAdjustment: "0" },
    ]);
  }

  function updateVariant(id: string, patch: Partial<ManualVariantDraft>) {
    setVariants((current) => current.map((variant) => variant.id === id ? { ...variant, ...patch } : variant));
  }

  async function selectImages(files: FileList | null) {
    if (!files?.length) return;
    const nextFiles = Array.from(files).slice(0, Math.max(0, 8 - selectedImages.length));
    try {
      const images = await Promise.all(nextFiles.map(async (file) => ({
        id: crypto.randomUUID(),
        file,
        dataUrl: await readFileAsDataUrl(file),
      })));
      setSelectedImages((current) => [...current, ...images]);
    } catch {
      toast.error("Failed to read selected images");
    }
  }

  async function uploadProductImages(productId: string) {
    if (!selectedImages.length) return;
    for (const image of selectedImages) {
      const res = await apiFetch(`/api/products/${productId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{
            dataUrl: image.dataUrl,
            mimeType: image.file.type,
            alt_text: name.trim(),
          }],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to upload product images");
    }
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Product name is required");
      return;
    }
    setSaving(true);
    try {
      const manualVariants = variants
        .filter((variant) => variant.optionName.trim() && variant.optionValue.trim())
        .map((variant) => ({
          attributes: { [variant.optionName.trim().toLowerCase()]: variant.optionValue.trim() },
          cog: parseFloat(variant.cog) || 0,
          stock_quantity: Math.max(0, parseInt(variant.stock, 10) || 0),
          selling_price: sellingPrice
            ? (parseFloat(sellingPrice) || 0) + (parseFloat(variant.priceAdjustment) || 0)
            : null,
        }));

      const res = await apiFetch("/api/products/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: "manual",
          products: [{
            name: name.trim(),
            description: description.trim() || null,
            image_url: imageUrl.trim() || null,
            url: productUrl.trim() || null,
            selling_price: sellingPrice ? parseFloat(sellingPrice) || 0 : null,
            compare_at_price: compareAtPrice ? parseFloat(compareAtPrice) || 0 : null,
            cog: parseFloat(cog) || 0,
            stock_quantity: Math.max(0, parseInt(stock, 10) || 0),
            published,
            variants: manualVariants,
          }],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to add product");
      const productId = json.products?.[0]?.id;
      if (productId) await uploadProductImages(productId);
      await onSaved();
      toast.success(selectedImages.length ? "Product added with images" : published ? "Product added and published" : "Product added");
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.16 }}
      className="border-b border-black/[0.08] bg-black/[0.015] px-5 py-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold text-black">Add Product</p>
          <p className="text-[12px] text-black/40">Create a product manually, then publish it to the public catalog.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-black/35 transition-colors hover:bg-black/[0.05] hover:text-black">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input data-testid="input-manual-product-name" value={name} onChange={e => setName(e.target.value)} placeholder="Product name" className={INPUT_CLS} />
        <input data-testid="input-manual-product-image" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="Image URL" className={INPUT_CLS} />
        <input data-testid="input-manual-product-url" value={productUrl} onChange={e => setProductUrl(e.target.value)} placeholder="Product URL" className={INPUT_CLS} />
        <input data-testid="input-manual-product-selling-price" type="number" min={0} value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} placeholder="Selling price ৳" className={INPUT_CLS} />
        <input data-testid="input-manual-product-compare-at-price" type="number" min={0} value={compareAtPrice} onChange={e => setCompareAtPrice(e.target.value)} placeholder="Compare price ৳" className={INPUT_CLS} />
        <input data-testid="input-manual-product-cog" type="number" min={0} value={cog} onChange={e => setCog(e.target.value)} placeholder="COG ৳" className={INPUT_CLS} />
        <input data-testid="input-manual-product-stock" type="number" min={0} value={stock} onChange={e => setStock(e.target.value)} placeholder="Stock quantity" className={INPUT_CLS} />
        <label className="flex h-9 items-center gap-2 rounded-[12px] border border-black/[0.1] bg-white px-3 text-[12px] text-black/60">
          <input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} className="h-4 w-4 accent-black" />
          Publish now
        </label>
      </div>

      <textarea
        data-testid="input-manual-product-description"
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description"
        className="mt-3 min-h-20 w-full rounded-[12px] border border-black/[0.1] bg-black/[0.04] px-3 py-2 text-[13px] text-black outline-none transition-colors placeholder:text-black/25 focus:bg-white focus-visible:ring-1 focus-visible:ring-black/20"
      />

      <div className="mt-3 rounded-[14px] border border-black/[0.08] bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">Images</p>
            <p className="text-[12px] text-black/40">Upload up to 8 product images. The first image becomes the public catalog thumbnail.</p>
          </div>
          <label className="cursor-pointer rounded-lg bg-black px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-80">
            Choose images
            <input
              data-testid="input-manual-product-images"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(event) => void selectImages(event.target.files)}
            />
          </label>
        </div>
        {selectedImages.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {selectedImages.map((image) => (
              <div key={image.id} className="group relative aspect-square overflow-hidden rounded-xl border border-black/[0.08] bg-black/[0.03]">
                <img src={image.dataUrl} alt={image.file.name} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setSelectedImages((current) => current.filter((item) => item.id !== image.id))}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-black/50 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                  aria-label={`Remove ${image.file.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">Variants</p>
          <button data-testid="button-add-manual-variant" type="button" onClick={addVariant} className="rounded-lg bg-black px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-80">
            Add variant
          </button>
        </div>
        {variants.map((variant) => (
          <div key={variant.id} className="grid gap-2 rounded-xl border border-black/[0.06] bg-white p-3 md:grid-cols-[1fr_1fr_100px_100px_120px_32px]">
            <input value={variant.optionName} onChange={e => updateVariant(variant.id, { optionName: e.target.value })} placeholder="Option, e.g. Color" className={INPUT_CLS} />
            <input value={variant.optionValue} onChange={e => updateVariant(variant.id, { optionValue: e.target.value })} placeholder="Value, e.g. Black" className={INPUT_CLS} />
            <input type="number" min={0} value={variant.stock} onChange={e => updateVariant(variant.id, { stock: e.target.value })} placeholder="Stock" className={INPUT_CLS} />
            <input type="number" min={0} value={variant.cog} onChange={e => updateVariant(variant.id, { cog: e.target.value })} placeholder="COG" className={INPUT_CLS} />
            <input type="number" value={variant.priceAdjustment} onChange={e => updateVariant(variant.id, { priceAdjustment: e.target.value })} placeholder="Price +/-" className={INPUT_CLS} />
            <button type="button" onClick={() => setVariants(current => current.filter(item => item.id !== variant.id))} className="flex h-9 items-center justify-center rounded-lg text-black/30 transition-colors hover:bg-red-50 hover:text-red-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-2">
        <PopButton color="blue" size="sm" type="button" onClick={submit} disabled={saving} className="gap-1.5 px-3 text-[11px] font-bold tracking-normal">
          {saving ? <Spinner size="sm" /> : <Plus className="h-3.5 w-3.5" />}
          Save product
        </PopButton>
        <PopButton color="default" size="sm" type="button" onClick={onClose} className="px-3 text-[11px] font-bold tracking-normal">
          Cancel
        </PopButton>
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

  // Inline edits
  const [cogEdits, setCogEdits] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);

  // Import
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawlStatus, setCrawlStatus] = useState<"idle" | "crawling" | "done" | "error">("idle");
  const [crawlMsg, setCrawlMsg] = useState("");

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!filterOpen) return;
    const fn = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [filterOpen]);

  const { data, isLoading, refetch } = useQuery<ProductsResponse>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await apiFetch("/api/products");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      return res.json();
    },
  });

  const allProducts = useMemo(() => data?.products ?? [], [data?.products]);
  const publishedCount = allProducts.filter(p => p.published).length;

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
    const varMsg = json.variants_saved > 0 ? ` with ${json.variants_saved} variant${json.variants_saved !== 1 ? "s" : ""}` : "";
    setCrawlMsg(`${json.saved} product${json.saved !== 1 ? "s" : ""}${varMsg} imported.`);
    toast.success(`${json.saved} products imported${varMsg}`);
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

  async function togglePublished(product: Product) {
    setSavingIds(s => new Set(s).add(product.id));
    try {
      const res = await apiFetch(`/api/products/${product.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !product.published }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to update publish status");
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      toast.success(product.published ? "Product unpublished" : "Product published");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update publish status");
    } finally {
      setSavingIds(s => { const n = new Set(s); n.delete(product.id); return n; });
    }
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
    ? "grid-cols-[52px_minmax(180px,1fr)_minmax(220px,2fr)_120px_180px_84px_112px]"
    : "grid-cols-[52px_minmax(180px,1fr)_minmax(220px,2fr)_120px_84px_112px]";

  return (
    <div className="min-h-full" style={{ fontFamily: SYS }}>
      <div className="space-y-5 p-1 lg:p-2">

        {/* ── Stats bar ── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-4"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Products"
              value={isLoading ? <span className="inline-block h-7 w-10 animate-pulse rounded-lg bg-black/[0.05]" /> : totalProducts}
              sub="In catalogue"
            />
            <StatCard
              label="Avg Margin"
              value={isLoading ? <span className="inline-block h-7 w-14 animate-pulse rounded-lg bg-black/[0.05]" /> : (avgMargin ? `${avgMargin}%` : "—")}
              sub="Selling price − cost"
              accent={avgMargin ? (parseFloat(avgMargin) > 40 ? "text-emerald-600" : parseFloat(avgMargin) > 20 ? "text-black" : "text-red-500") : undefined}
            />
            <StatCard
              label="Total Stock"
              value={isLoading ? <span className="inline-block h-7 w-16 animate-pulse rounded-lg bg-black/[0.05]" /> : totalStock.toLocaleString("en-BD")}
              sub="Units available"
            />
            <StatCard
              label="Out of Stock"
              value={isLoading ? <span className="inline-block h-7 w-8 animate-pulse rounded-lg bg-black/[0.05]" /> : outCount}
              sub="Variants / products"
              accent={outCount > 0 ? "text-red-500" : "text-black"}
            />
          </div>
          <div className="rounded-xl border border-black/[0.08] bg-white px-5 py-3 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[13px] text-black/60">
                Total cost value: <span className="font-semibold text-black">{fmt(totalCog)}</span>
                <span className="mx-2 text-black/20">/</span>
                Published: <span className="font-semibold text-black">{publishedCount}</span>
              </span>
              {data?.storefront?.products_url && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(data.storefront!.products_url);
                    toast.success("Public catalog URL copied");
                  }}
                  className="truncate rounded-lg bg-black px-3 py-1.5 text-left text-[11px] font-medium text-white transition-opacity hover:opacity-80"
                  title={data.storefront.products_url}
                >
                  Copy public catalog API
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Import from website — always visible ── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.04 }}
          className="rounded-xl border border-black/[0.16] bg-white p-5 shadow-[0_1px_1px_0_rgba(0,0,0,0.04)]"
        >
          <div className="mb-4 flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-black/60" />
            <span className="text-[14px] font-semibold text-black">Import from Website</span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              data-testid="input-crawl-url"
              type="url"
              placeholder="https://yourstore.com — AI extracts products automatically"
              value={crawlUrl}
              onChange={e => setCrawlUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && crawlStatus !== "crawling" && handleCrawl()}
              className={cn(
                INPUT_CLS,
                "h-9 flex-1 rounded-[8px] border-transparent bg-white font-sans shadow-[0_1px_2px_0_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.12),inset_0_1px_0_0_#FDFDFD] focus-visible:ring-0",
              )}
            />
            <RichButton
              data-testid="button-crawl"
              color="default"
              size="default"
              className="h-9 shrink-0"
              onClick={handleCrawl}
              disabled={crawlStatus === "crawling" || !crawlUrl.trim()}
            >
              {crawlStatus === "crawling" ? <Spinner size="sm" className="mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {crawlStatus === "crawling" ? "Extracting…" : "Extract"}
            </RichButton>
          </div>
          <AnimatePresence>
            {crawlMsg && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn("mt-3 text-[12px]",
                  crawlStatus === "error" ? "text-red-500" : "text-emerald-600"
                )}
              >
                {crawlMsg}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Main product card ── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="overflow-hidden rounded-xl border border-black/[0.16] bg-white shadow-[0_1px_1px_0_rgba(0,0,0,0.04)]"
        >
          {/* ── Toolbar ── */}
          <div className="flex flex-col gap-3 border-b border-black/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: title + count */}
            <div className="flex items-center gap-2">
              <PackageSearch className="h-4 w-4 text-black/60" />
              <span className="text-[14px] font-semibold text-black">Products</span>
              {!isLoading && (
                <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-black/60">
                  {products.length}{products.length !== allProducts.length && `/${allProducts.length}`}
                </span>
              )}
            </div>

            {/* Right: search + filter + refresh */}
            <div className="flex flex-wrap items-center gap-2">
              <RichButton
                data-testid="button-add-product"
                color="default"
                size="default"
                onClick={() => setAddingProduct(v => !v)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </RichButton>

              {/* Search */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-black/25" />
                <input
                  type="text"
                  placeholder="Search products…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  className="h-9 w-52 rounded-xl border border-black/[0.1] bg-black/[0.04] pl-9 pr-3 text-[13px] text-black outline-none transition-all placeholder:text-black/25 focus-visible:ring-1 focus-visible:ring-black/20 focus:bg-white focus:w-64"
                />
                {query && (
                  <button onClick={() => setQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-black/25 hover:text-black">
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
                      ? "border-black/20 bg-black text-white"
                      : "border-black/[0.1] bg-black/[0.04] text-black/40 hover:text-black"
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
                      className="absolute right-0 top-full z-40 mt-1.5 w-44 overflow-hidden rounded-[14px] border border-black/[0.08] bg-white py-1 shadow-sm"
                    >
                      {(["all", "in_stock", "low_stock", "out_of_stock"] as StockFilter[]).map(f => (
                        <button key={f}
                          onClick={() => { setStockFilter(f); setFilterOpen(false); }}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-[13px] transition-colors hover:bg-black/[0.04]",
                            stockFilter === f ? "font-semibold text-black" : "text-black/60"
                          )}>
                          <span className={cn("h-2 w-2 rounded-full",
                            f === "in_stock"     && "bg-emerald-500",
                            f === "low_stock"    && "bg-amber-400",
                            f === "out_of_stock" && "bg-red-500",
                            f === "all"          && "bg-black/[0.15]"
                          )} />
                          {FILTER_LABELS[f]}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Refresh */}
              <button
                onClick={() => refetch()}
                disabled={isLoading}
                data-testid="button-refresh-products"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.1] bg-black/[0.04] text-black/40 transition-colors hover:text-black disabled:opacity-30">
                {isLoading ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {addingProduct && (
              <AddProductDrawer
                onClose={() => setAddingProduct(false)}
                onSaved={() => qc.invalidateQueries({ queryKey: ["/api/products"] })}
              />
            )}
          </AnimatePresence>

          {/* ── Table body ── */}
          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-black/40">
              <Spinner className="mr-2.5" />
              <span className="text-[14px]">Loading products…</span>
            </div>
          ) : allProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-black/[0.08] bg-black/[0.03]">
                <PackageSearch className="h-7 w-7 text-black/20" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-[15px] font-semibold text-black">No products yet</p>
                <p className="text-[13px] text-black/40 max-w-xs">
                  Use the Import from Website section above to extract products from your store URL.
                </p>
              </div>
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <Search className="h-8 w-8 text-black/20" />
              <p className="text-[14px] font-medium text-black">No results for "{query || FILTER_LABELS[stockFilter]}"</p>
              <button onClick={() => { setQuery(""); setStockFilter("all"); }}
                className="text-[13px] text-black/40 underline underline-offset-2 hover:text-black transition-colors">
                Clear filters
              </button>
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div className={cn("grid border-b border-black/[0.06] bg-black/[0.02]", GRID)}>
                {(isAdmin
                  ? ["", "Product", "Variants", "Price", "Cost", "Margin", "Publish"]
                  : ["", "Product", "Variants", "Price", "Margin", "Publish"]
                ).map((h, i, arr) => {
                  const isNumeric = ["Price", "Cost", "Margin"].includes(h);
                  return (
                    <div key={i} className={cn("px-4 py-2.5", i === 0 && "pl-5", isNumeric && "text-center")}>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-black/40">{h}</span>
                    </div>
                  );
                })}
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
                        "group grid items-start border-b border-black/[0.08] transition-colors hover:bg-black/[0.015]",
                        GRID, isAdding && "bg-black/[0.01]"
                      )}>

                        {/* Thumbnail */}
                        <div className="flex items-center py-4 pl-5">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-black/[0.06] bg-black/[0.03]">
                            {product.image_url
                              ? <img src={product.image_url} alt={product.name}
                                  className="h-full w-full object-cover"
                                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              : <div className="flex h-full w-full items-center justify-center">
                                  <Package2 className="h-4 w-4 text-black/20" />
                                </div>
                            }
                          </div>
                        </div>

                        {/* Name + URL + stock (no-variant) */}
                        <div className="flex min-w-0 flex-col gap-0.5 px-4 py-4">
                          <p data-testid={`text-product-name-${product.id}`}
                            className="truncate text-[13px] font-medium text-black">
                            {product.name}
                          </p>
                          {product.url && (
                            <a href={product.url} target="_blank" rel="noopener noreferrer"
                              data-testid={`link-product-${product.id}`}
                              className="truncate text-[11px] text-black/30 transition-colors hover:text-black/50">
                              {product.url.replace(/^https?:\/\//, "").substring(0, 42)}
                            </a>
                          )}
                          {product.published && (
                            <span className="w-fit rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700 ring-1 ring-inset ring-emerald-200">
                              Published{product.slug ? ` / ${product.slug}` : ""}
                            </span>
                          )}
                          {product.variants.length === 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className={cn("h-[5px] w-[5px] rounded-full",
                                ss === "out" && "bg-red-500",
                                ss === "low" && "bg-amber-400",
                                ss === "ok"  && "bg-emerald-500"
                              )} />
                              <span className={cn("text-[11px]",
                                ss === "out" && "text-red-500 font-medium",
                                ss === "low" && "text-amber-500 font-medium",
                                ss === "ok"  && "text-black/40"
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

                        {/* Price — centered under column header */}
                        <div className="px-4 pt-4 pb-3 text-center">
                          <span
                            data-testid={`text-selling-price-${product.id}`}
                            className="font-mono text-[13px] tabular-nums text-black"
                          >
                            {fmt(product.selling_price)}
                          </span>
                        </div>

                        {/* COG — admin editable, centered under column header */}
                        {isAdmin && (
                          <div className="px-4 pt-4 pb-3">
                            <div className="relative flex w-full">
                              <div className="relative flex-1">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-zinc-900">৳</span>
                                <input
                                  data-testid={`input-cog-${product.id}`}
                                  type="number" min={0} value={cogVal}
                                  onChange={e => setCogEdits(p => ({ ...p, [product.id]: e.target.value }))}
                                  onKeyDown={e => e.key === "Enter" && isDirty && saveCog(product)}
                                  className="h-9 w-full rounded-[12px] pl-7 pr-11 font-mono text-[13px] outline-none tabular-nums focus-visible:ring-2 focus-visible:ring-black/20 bg-[#E3E3E3]/80 shadow-[0_2px_4px_0_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.16),inset_0_1px_0_0_#FDFDFD] text-zinc-900 transition-all hover:bg-[#E3E3E3]"
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
                                    className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-md bg-black text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                                  >
                                    {isSaving ? <Spinner size="sm" /> : <Check className="h-3.5 w-3.5" />}
                                  </motion.button>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        )}

                        {/* Margin — centered under column header */}
                        <div className="px-4 pt-4 pb-3 text-center">
                          <span
                            data-testid={`text-margin-${product.id}`}
                            className={cn("text-[13px] tabular-nums font-medium",
                              mgn == null ? "text-black/25"
                              : parseFloat(mgn) > 40 ? "text-emerald-600"
                              : parseFloat(mgn) > 20 ? "text-black"
                              : "text-red-500"
                            )}>
                            {mgn != null ? `${mgn}%` : "—"}
                          </span>
                        </div>

                        {/* Publish + delete */}
                        <div className="flex items-start justify-end gap-2 pt-4 pb-3 pr-3">
                          <button
                            data-testid={`button-toggle-published-${product.id}`}
                            onClick={() => togglePublished(product)}
                            disabled={isSaving}
                            className={cn(
                              "flex h-8 items-center justify-center rounded-xl px-3 text-[11px] font-semibold transition-all disabled:opacity-40",
                              product.published
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100"
                                : "bg-black text-white hover:opacity-80"
                            )}
                          >
                            {isSaving ? <Spinner size="sm" /> : product.published ? "Live" : "Publish"}
                          </button>
                          <button
                            data-testid={`button-delete-product-${product.id}`}
                            onClick={() => deleteMutation.mutate(product.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-xl text-black/25 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100">
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
              <div className="flex items-center gap-5 border-t border-black/[0.06] px-6 py-3">
                {[
                  { dot: "bg-emerald-500", label: "In stock" },
                  { dot: "bg-amber-400",   label: "Low (≤5)" },
                  { dot: "bg-red-500",     label: "Out of stock" },
                ].map(({ dot, label }) => (
                  <span key={label} className="flex items-center gap-1.5 text-[11px] text-black/40">
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
