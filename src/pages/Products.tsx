import { useState, useRef, useEffect, useMemo, Fragment } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type ColumnDef, type SortingState, type ColumnFiltersState,
  type VisibilityState, type RowSelectionState, type Column,
  flexRender, getCoreRowModel, getFilteredRowModel,
  getPaginationRowModel, getSortedRowModel, useReactTable,
} from "@tanstack/react-table";
import { toast } from "@/components/ui/sonner";
import { motion, AnimatePresence, useReducedMotion, type Transition } from "framer-motion";
import {
  Search, Trash2, PackageSearch,
  Package2, RefreshCw, Plus, X,
  Check, ChevronDown, FileEdit,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { Select as BuiSelect, SelectItem as BuiSelectItem } from "@/components/base/select/select";
import { Input as BuiInput } from "@/components/base/input/input";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { Checkbox as BuiCheckbox } from "@/components/base/checkbox/checkbox";
import { FileUpload } from "@/components/base/file-upload/file-upload";
import { Chip } from "@/components/base/badges/chip";
import { ChevronDownSmall } from "@/components/foundations/icons/chevrons";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import { PopButton } from "@/components/ui/pop-button";
import { RichButton } from "@/components/ui/rich-button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { useNavigate } from "react-router-dom";
import {
  type Product,
  type ProductVariant,
  type ProductsResponse,
} from "./products/shared";

// ── Design tokens ─────────────────────────────────────────────────────────────
// Apple-style: pure white surfaces, SF-system font stack, razor-thin borders,
// no shadows on content panels, generous whitespace, monochrome palette.
// Every editable numeric cell uses the same h-9 w-full input.

// ── Types ─────────────────────────────────────────────────────────────────────

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

// Board UI data-table status tokens (see src/components/base/badges/chip.tsx)
type StockStatusKind = "out" | "low" | "ok";
const STATUS_TOKEN: Record<StockStatusKind, { chip: string; text: string; dot: string }> = {
  ok:  { chip: "bg-background-tertiary-default text-text-secondary", text: "text-text-secondary", dot: "bg-status-lime-text" },
  low: { chip: "bg-status-yellow-background text-status-yellow-text", text: "text-status-yellow-text", dot: "bg-status-yellow-text" },
  out: { chip: "bg-status-rose-background text-status-rose-text", text: "text-status-rose-text", dot: "bg-status-rose-text" },
};

function statusToChipColor(s: StockStatusKind): "lime" | "yellow" | "rose" {
  return s === "out" ? "rose" : s === "low" ? "yellow" : "lime";
}

function attrLabel(a: Record<string, string>): string {
  return Object.values(a).filter(Boolean).join(" · ");
}

const SIZE_ORDER: Record<string, number> = {
  XS: 0, S: 1, M: 2, L: 3, XL: 4, XXL: 5, XXXL: 6,
};

function sizeSortKey(a: Record<string, string>): number {
  const val = Object.values(a).filter(Boolean)[0]?.toUpperCase() ?? "";
  return SIZE_ORDER[val] ?? 99;
}

function WebsiteImportIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <g clipPath="url(#clip0_4418_8228)">
        <path d="M7.65006 20.9098C7.62006 20.9098 7.58006 20.9298 7.55006 20.9298C5.61006 19.9698 4.03006 18.3798 3.06006 16.4398C3.06006 16.4098 3.08006 16.3698 3.08006 16.3398C4.30006 16.6998 5.56006 16.9698 6.81006 17.1798C7.03006 18.4398 7.29006 19.6898 7.65006 20.9098Z" />
        <path d="M20.94 16.4498C19.95 18.4398 18.3 20.0498 16.29 21.0198C16.67 19.7498 16.99 18.4698 17.2 17.1798C18.46 16.9698 19.7 16.6998 20.92 16.3398C20.91 16.3798 20.94 16.4198 20.94 16.4498Z" />
        <path d="M21.02 7.71047C19.76 7.33047 18.49 7.02047 17.2 6.80047C16.99 5.51047 16.68 4.23047 16.29 2.98047C18.36 3.97047 20.03 5.64047 21.02 7.71047Z" />
        <path d="M7.64998 3.09055C7.28998 4.31055 7.02998 5.55055 6.81998 6.81055C5.52998 7.01055 4.24998 7.33055 2.97998 7.71055C3.94998 5.70055 5.55998 4.05055 7.54998 3.06055C7.57998 3.06055 7.61998 3.09055 7.64998 3.09055Z" />
        <path d="M15.49 6.59C13.17 6.33 10.83 6.33 8.51001 6.59C8.76001 5.22 9.08001 3.85 9.53001 2.53C9.55001 2.45 9.54001 2.39 9.55001 2.31C10.34 2.12 11.15 2 12 2C12.84 2 13.66 2.12 14.44 2.31C14.45 2.39 14.45 2.45 14.47 2.53C14.92 3.86 15.24 5.22 15.49 6.59Z" />
        <path d="M6.59 15.4898C5.21 15.2398 3.85 14.9198 2.53 14.4698C2.45 14.4498 2.39 14.4598 2.31 14.4498C2.12 13.6598 2 12.8498 2 11.9998C2 11.1598 2.12 10.3398 2.31 9.55977C2.39 9.54977 2.45 9.54977 2.53 9.52977C3.86 9.08977 5.21 8.75977 6.59 8.50977C6.34 10.8298 6.34 13.1698 6.59 15.4898Z" />
        <path d="M21.9999 11.9998C21.9999 12.8498 21.8799 13.6598 21.6899 14.4498C21.6099 14.4598 21.5499 14.4498 21.4699 14.4698C20.1399 14.9098 18.7799 15.2398 17.4099 15.4898C17.6699 13.1698 17.6699 10.8298 17.4099 8.50977C18.7799 8.75977 20.1499 9.07977 21.4699 9.52977C21.5499 9.54977 21.6099 9.55977 21.6899 9.55977C21.8799 10.3498 21.9999 11.1598 21.9999 11.9998Z" />
        <path d="M15.49 17.4102C15.24 18.7902 14.92 20.1502 14.47 21.4702C14.45 21.5502 14.45 21.6102 14.44 21.6902C13.66 21.8802 12.84 22.0002 12 22.0002C11.15 22.0002 10.34 21.8802 9.55001 21.6902C9.54001 21.6102 9.55001 21.5502 9.53001 21.4702C9.09001 20.1402 8.76001 18.7902 8.51001 17.4102C9.67001 17.5402 10.83 17.6302 12 17.6302C13.17 17.6302 14.34 17.5402 15.49 17.4102Z" />
        <path d="M15.7633 15.7633C13.2622 16.0789 10.7378 16.0789 8.23667 15.7633C7.92111 13.2622 7.92111 10.7378 8.23667 8.23667C10.7378 7.92111 13.2622 7.92111 15.7633 8.23667C16.0789 10.7378 16.0789 13.2622 15.7633 15.7633Z" />
      </g>
      <defs>
        <clipPath id="clip0_4418_8228">
          <rect width="24" height="24" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
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
      <div className="flex flex-col min-w-0 overflow-hidden rounded-2xl bg-black/[0.04] p-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-black/50">
        {label}
      </p>
      <p
        className={cn("mt-0.5 text-2xl font-semibold tabular-nums tracking-tight", accent ?? "text-black")}
        style={{ fontFamily: SYS }}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[12px] text-black/40" style={{ fontFamily: SYS }}>{sub}</p>
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

  const token = STATUS_TOKEN[status];
  const chipColor = statusToChipColor(status);

  return (
    <div className="relative inline-block" ref={ref}>
      <Chip
        variant="caption"
        color={chipColor}
        role="button"
        tabIndex={0}
        onClick={(event) => { event.stopPropagation(); setOpen(v => !v); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setOpen(v => !v); } }}
        className={cn("cursor-pointer select-none gap-1.5 leading-none w-[72px] justify-center", open && "ring-2 ring-black/30")}
      >
        <span className={cn("h-[5px] w-[5px] rounded-full shrink-0", token.dot)} />
        <span style={{ fontFamily: SYS }}>{attrLabel(variant.attributes)}</span>
        <span className="opacity-30">·</span>
        <span className="tabular-nums" style={{ fontFamily: SYS }}>
          {status === "out" ? "Out" : variant.stock_quantity}
        </span>
      </Chip>

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

// ─ Variant chips strip (stacked list) ────────────────────────────────────────

function VariantStrip({
  product, isAdmin, onAdd,
}: { product: Product; isAdmin: boolean; onAdd: () => void }) {
  const { variants } = product;

  if (variants.length === 0) {
    return (
      <button onClick={(event) => { event.stopPropagation(); onAdd(); }}
        className="inline-flex items-center gap-1 rounded-[8px] border border-dashed border-black/[0.15] px-3 py-[5px] text-[11px] text-text-secondary transition-colors hover:border-black/30 hover:text-text-primary"
        style={{ fontFamily: SYS }}>
        <Plus className="h-3 w-3" /> Add variants
      </button>
    );
  }

  const sorted = [...variants].sort((a, b) => sizeSortKey(a.attributes) - sizeSortKey(b.attributes));

  return (
    <div className="flex flex-col gap-1.5">
      {sorted.map(v => (
        <VariantChip key={v.id} variant={v} productId={product.id} isAdmin={isAdmin} />
      ))}
      <button onClick={(event) => { event.stopPropagation(); onAdd(); }}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] border border-dashed border-black/[0.15] text-text-secondary transition-colors hover:border-black/30 hover:text-text-primary">
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

// ── BoardUI-style data table ──────────────────────────────────────────────────
// Built on @tanstack/react-table: sortable headers, column visibility toggle,
// faceted stock filter, global search, pagination and row selection. Keeps every
// existing interaction (variant chips, inline COG edit, publish toggle, delete,
// add-variant drawer).

type ColMeta = { align?: "left" | "right" | "center" };

type ProductsDataTableProps = {
  products: Product[];
  isAdmin: boolean;
  isLoading: boolean;
  onAddProduct: () => void;
  onEditProduct: (id: string) => void;
};

function SortHeader({ column, title }: { column: Column<Product>; title: string }) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className="inline-flex items-center gap-1 text-body-medium text-text-tertiary transition-colors hover:text-text-secondary"
    >
      {title}
      {sorted === "asc" ? (
        <ArrowUp className="h-3 w-3 text-text-secondary" />
      ) : sorted === "desc" ? (
        <ArrowDown className="h-3 w-3 text-text-secondary" />
      ) : (
        <ArrowUpDown className="h-3 w-3 text-text-tertiary" />
      )}
    </button>
  );
}

function ProductsDataTable({ products, isAdmin, isLoading, onAddProduct, onEditProduct }: ProductsDataTableProps) {
  const qc = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ stockStatus: false });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState("");

  // Inline table state
  const [cogEdits, setCogEdits] = useState<Record<string, string>>({});
  const [editingCogFor, setEditingCogFor] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [addingFor, setAddingFor] = useState<string | null>(null);

  async function saveCog(product: Product) {
    if (cogEdits[product.id] === undefined) return;
    setSavingIds((s) => new Set(s).add(product.id));
    try {
      const res = await apiFetch(`/api/products/${product.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cog: parseFloat(cogEdits[product.id]) || 0 }),
      });
      if (!res.ok) throw new Error();
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      setCogEdits((e) => { const n = { ...e }; delete n[product.id]; return n; });
      setEditingCogFor(null);
      toast.success("COG updated");
    } catch { toast.error("Failed to save"); }
    finally { setSavingIds((s) => { const n = new Set(s); n.delete(product.id); return n; }); }
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/products"] }); toast.success("Removed"); },
    onError: () => toast.error("Failed to delete"),
  });

  const draftMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: false }),
      });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      toast.success("Moved to drafts");
    },
    onError: () => toast.error("Failed to draft"),
  });

  const columns: ColumnDef<Product>[] = [
    {
      id: "select",
      enableHiding: false,
      enableSorting: false,
      size: 40,
      header: ({ table }) => (
        <div onClick={(e) => e.stopPropagation()} className="flex">
          <Checkbox
            checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Select row"
          />
        </div>
      ),
    },
    {
      accessorKey: "name",
      header: "Product",
      enableHiding: false,
      cell: ({ row }) => {
        const product = row.original;
        const stock = effectiveStock(product);
        const ss = stockStatus(stock);
        return (
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-black/[0.08] bg-black/[0.03]">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="flex h-full w-full items-center justify-center"><Package2 className="h-4 w-4 text-black/20" /></div>
              )}
              {product.images?.length > 1 && (
                <span className="absolute bottom-0.5 right-0.5 rounded-full bg-black/85 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow-sm">+{product.images.length - 1}</span>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <p data-testid={`text-product-name-${product.id}`} className="truncate text-body-medium leading-5 text-text-primary">{product.name}</p>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {product.url && (
                  <a href={product.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} data-testid={`link-product-${product.id}`} className="max-w-[210px] truncate text-[11px] leading-4 text-text-tertiary transition-colors hover:text-text-secondary">{product.url.replace(/^https?:\/\//, "").substring(0, 42)}</a>
                )}
              </div>
              {product.variants.length === 0 && (
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-[5px] w-[5px] rounded-full", STATUS_TOKEN[ss].dot)} />
                  <span className={cn("text-[11px]", STATUS_TOKEN[ss].text, ss !== "ok" && "font-medium")}>{ss === "out" ? "Out of stock" : `${stock} in stock`}</span>
                </div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      id: "variants",
      header: "Variants",
      enableSorting: false,
      cell: ({ row }) => (
        <VariantStrip
          product={row.original}
          isAdmin={isAdmin}
          onAdd={() => setAddingFor(addingFor === row.original.id ? null : row.original.id)}
        />
      ),
    },
    {
      accessorKey: "selling_price",
      header: ({ column }) => <SortHeader column={column} title="Price" />,
      meta: { align: "center" } as ColMeta,
      cell: ({ row }) => (
        <span data-testid={`text-selling-price-${row.original.id}`} className="font-mono text-body-medium tabular-nums text-text-primary">{fmt(row.original.selling_price)}</span>
      ),
      sortingFn: (a, b) => (a.original.selling_price ?? -1) - (b.original.selling_price ?? -1),
    },
    ...(isAdmin ? [{
      accessorKey: "cog",
      header: ({ column }) => <SortHeader column={column} title="Cost" />,
      meta: { align: "center" } as ColMeta,
      cell: ({ row }) => {
        const product = row.original;
        const cogVal = cogEdits[product.id] ?? String(product.cog ?? 0);
        if (editingCogFor === product.id) {
          return (
            <div className="relative mx-auto w-[88px]" onClick={(e) => e.stopPropagation()}>
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-text-primary">৳</span>
              <input data-testid={`input-cog-${product.id}`} autoFocus type="number" min={0} value={cogVal}
                onChange={(e) => setCogEdits((p) => ({ ...p, [product.id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && saveCog(product)}
                className="h-8 w-full border-b border-black/25 bg-transparent pl-6 pr-2 font-mono text-[13px] outline-none tabular-nums text-text-primary focus-visible:border-black [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
            </div>
          );
        }
        return (
          <button type="button" data-testid={`button-edit-cog-${product.id}`} onClick={(e) => { e.stopPropagation(); setEditingCogFor(product.id); setCogEdits((p) => ({ ...p, [product.id]: String(product.cog ?? 0) })); }}
            className="font-mono text-body-medium tabular-nums text-text-primary transition-colors hover:text-text-secondary">
            {fmt(product.cog)}
          </button>
        );
      },
      sortingFn: (a, b) => (a.original.cog ?? 0) - (b.original.cog ?? 0),
    } as ColumnDef<Product>] : []),
    {
      id: "margin",
      header: ({ column }) => <SortHeader column={column} title="Margin" />,
      meta: { align: "center" } as ColMeta,
      accessorFn: (row) => {
        const c = parseFloat(cogEdits[row.id] ?? String(row.cog ?? 0)) || 0;
        const s = row.selling_price;
        return s ? ((s - c) / s) * 100 : -Infinity;
      },
      cell: ({ row }) => {
        const c = parseFloat(cogEdits[row.original.id] ?? String(row.original.cog ?? 0)) || 0;
        const mgn = pct(row.original.selling_price, c);
        return (
          <span data-testid={`text-margin-${row.original.id}`} className={cn("text-body-medium tabular-nums font-medium",
            mgn == null ? "text-text-tertiary"
            : parseFloat(mgn) > 40 ? "text-emerald-600"
            : parseFloat(mgn) > 20 ? "text-text-primary"
            : "text-red-500")}>
            {mgn != null ? `${mgn}%` : "—"}
          </span>
        );
      },
      sortingFn: (a, b) => (a.getValue("margin") as number) - (b.getValue("margin") as number),
    },
    {
      id: "stock",
      header: ({ column }) => <SortHeader column={column} title="Stock" />,
      meta: { align: "center" } as ColMeta,
      accessorFn: (row) => effectiveStock(row),
      cell: ({ row }) => {
        const s = effectiveStock(row.original);
        const ss = stockStatus(s);
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("h-[6px] w-[6px] rounded-full", STATUS_TOKEN[ss].dot)} />
            <span className={cn("text-[12px] tabular-nums", STATUS_TOKEN[ss].text, ss !== "ok" && "font-medium")}>
              {ss === "out" ? "Out" : s}
            </span>
          </span>
        );
      },
    },
    {
      id: "stockStatus",
      accessorFn: (row) => stockStatus(effectiveStock(row)),
      enableHiding: false,
      enableSorting: false,
      filterFn: (row, id, value) => {
        const v = value as string[];
        return v.length === 0 || v.includes(row.getValue(id));
      },
    },
  ];

  const table = useReactTable({
    data: products,
    columns,
    state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter },
    enableRowSelection: true,
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue).toLowerCase().trim();
      if (!q) return true;
      const p = row.original;
      return p.name.toLowerCase().includes(q)
        || (p.url ?? "").toLowerCase().includes(q)
        || p.variants.some((v) => attrLabel(v.attributes).toLowerCase().includes(q));
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 8 } },
  });

  const stockFilterValue = (table.getColumn("stockStatus")?.getFilterValue() as string[] | undefined)?.[0] ?? "all";
  function setStockFilter(value: string) {
    const col = table.getColumn("stockStatus");
    if (value === "all") col?.setFilterValue(undefined);
    else col?.setFilterValue([value]);
  }

  const selectedCount = table.getSelectedRowModel().rows.length;
  const filteredCount = table.getFilteredRowModel().rows.length;

  function deleteSelected() {
    table.getSelectedRowModel().rows.forEach((r) => deleteMutation.mutate(r.original.id));
    table.resetRowSelection();
  }

  function draftSelected() {
    table.getSelectedRowModel().rows.forEach((r) => draftMutation.mutate(r.original.id));
    table.resetRowSelection();
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-[color:var(--color-separator-border)] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PackageSearch className="h-4 w-4 text-black/60" />
            <span className="text-[14px] font-semibold text-black">Products</span>
            {!isLoading && (
              <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-black/60">{filteredCount}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedCount > 0 && (
              <>
                <button onClick={draftSelected}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-background-secondary-default px-3 text-[13px] font-medium text-text-secondary ring-1 ring-inset ring-black/10 transition-colors hover:text-text-primary">
                  <FileEdit className="h-3.5 w-3.5" /> Draft ({selectedCount})
                </button>
                <button onClick={deleteSelected}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-red-50 px-3 text-[13px] font-medium text-red-600 ring-1 ring-inset ring-red-200 transition-colors hover:bg-red-100">
                  <Trash2 className="h-3.5 w-3.5" /> Delete ({selectedCount})
                </button>
              </>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search products…"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="h-9 w-52 rounded-xl border border-black/[0.1] bg-background-secondary-default pl-9 pr-3 text-[13px] text-text-primary outline-none transition-all placeholder:text-text-tertiary focus-visible:ring-1 focus-visible:ring-black/20 focus:bg-background-primary-default focus:w-64"
              />
              {globalFilter && (
                <button onClick={() => setGlobalFilter("")}               className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <BuiSelect
              aria-label="Filter by stock"
              selectedKey={stockFilterValue}
              onSelectionChange={(key) => setStockFilter(String(key))}
              className="w-full sm:w-44"
              popoverClassName="min-w-44"
            >
              <BuiSelectItem id="all">All Stock</BuiSelectItem>
              <BuiSelectItem id="in_stock">In stock</BuiSelectItem>
              <BuiSelectItem id="low_stock">Low stock</BuiSelectItem>
              <BuiSelectItem id="out_of_stock">Out of stock</BuiSelectItem>
            </BuiSelect>
            <RichButton data-testid="button-add-product" color="default" size="default" onClick={onAddProduct}>
              <span className="flex items-center gap-2"><Plus className="h-4 w-4" />Add Product</span>
            </RichButton>
          </div>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-text-tertiary">
          <Spinner className="mr-2.5" />
          <span className="text-[14px]">Loading products…</span>
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-black/[0.06] bg-background-secondary-default">
              <PackageSearch className="h-7 w-7 text-text-tertiary" />
          </div>
          <div className="space-y-1 text-center">
              <p className="text-[15px] font-semibold text-text-primary">No products yet</p>
              <p className="text-[13px] text-text-tertiary max-w-xs">Use the Import from Website section above to extract products from your store URL.</p>
          </div>
        </div>
      ) : filteredCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <Search className="h-8 w-8 text-black/20" />
            <p className="text-[14px] font-medium text-text-primary">No results match your filters</p>
            <button onClick={() => { setGlobalFilter(""); table.getColumn("stockStatus")?.setFilterValue(undefined); }}
              className="text-[13px] text-text-tertiary underline underline-offset-2 hover:text-text-primary transition-colors">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full caption-bottom text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-y border-[color:var(--color-separator-border)] bg-background-secondary-default">
                  {hg.headers.map((h) => {
                    const meta = (h.column.columnDef.meta ?? {}) as ColMeta;
                    return (
                      <th key={h.id}
                          className={cn("h-11 px-4 align-middle text-body-medium text-text-tertiary",
                          meta.align === "right" && "text-right", meta.align === "center" && "text-center", h.column.id === "select" && "pl-5")}>
                        {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    onClick={() => onEditProduct(row.original.id)}
                    data-testid={`row-product-${row.original.id}`}
                    className={cn("group cursor-pointer border-b border-[color:var(--color-separator-border)] transition-colors hover:bg-background-secondary-default", row.getIsSelected() && "bg-background-secondary-default")}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = (cell.column.columnDef.meta ?? {}) as ColMeta;
                      return (
                        <td key={cell.id}
                          className={cn("px-4 py-3 align-middle", meta.align === "right" && "text-right", meta.align === "center" && "text-center", cell.column.id === "select" && "pl-5")}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                  {addingFor === row.original.id && (
                    <tr className="border-b border-[color:var(--color-separator-border)] bg-background-secondary-default">
                      <td colSpan={row.getVisibleCells().length} className="p-0">
                        <AddVariantDrawer product={row.original} isAdmin={isAdmin} onClose={() => setAddingFor(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination + legend */}
      {!isLoading && products.length > 0 && filteredCount > 0 && (
        <div className="flex flex-col gap-3 border-t border-black/[0.06] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <span className="text-[12px] text-text-tertiary">
              {selectedCount} of {filteredCount} row{filteredCount !== 1 ? "s" : ""} selected.
            </span>
            <Chip variant="caption" color="lime" className="hidden items-center gap-1.5 sm:inline-flex">
              <span className="h-[6px] w-[6px] rounded-full bg-status-lime-text" /> In stock
            </Chip>
            <Chip variant="caption" color="yellow" className="hidden items-center gap-1.5 sm:inline-flex">
              <span className="h-[6px] w-[6px] rounded-full bg-status-yellow-text" /> Low (≤5)
            </Chip>
            <Chip variant="caption" color="rose" className="hidden items-center gap-1.5 sm:inline-flex">
              <span className="h-[6px] w-[6px] rounded-full bg-status-rose-text" /> Out
            </Chip>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[12px] text-text-secondary">
              <span>Rows per page</span>
              <Select value={String(table.getState().pagination.pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
                  <SelectTrigger className="h-8 w-[72px] rounded-lg border-black/[0.1] bg-background-primary-default text-[12px] text-text-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border-black/[0.08] bg-background-primary-default">
                  {[8, 16, 24, 50].map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-[12px]">{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-[12px] text-text-secondary">Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.1] bg-background-secondary-default text-text-secondary transition-colors hover:text-text-primary disabled:opacity-30">
                <ChevronsLeft className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.1] bg-background-secondary-default text-text-secondary transition-colors hover:text-text-primary disabled:opacity-30">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.1] bg-background-secondary-default text-text-secondary transition-colors hover:text-text-primary disabled:opacity-30">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.1] bg-background-secondary-default text-text-secondary transition-colors hover:text-text-primary disabled:opacity-30">
                <ChevronsRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Products() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();

  // Import
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawlStatus, setCrawlStatus] = useState<"idle" | "crawling" | "done" | "error">("idle");
  const [crawlMsg, setCrawlMsg] = useState("");

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

  // Filtering / sorting / pagination / selection now happen inside
  // <ProductsDataTable />, which receives the full `allProducts` list.

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

  // Inline mutations (COG edit, publish toggle, delete, variant add) and table
  // state (sorting / filtering / pagination / selection) now live in
  // <ProductsDataTable /> below. The page shell keeps only the stats, the
  // website-import surface, and the add/edit product drawers.

  return (
    <div className="min-h-full" style={{ fontFamily: SYS }}>
      <div className="min-h-full space-y-5 bg-white p-1 lg:p-2">

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
          <div           className="hidden rounded-2xl bg-black/[0.04] px-5 py-3">
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
          className="hidden rounded-2xl bg-black/[0.04] p-5"
          >
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-[8px] bg-black text-white [&_svg]:h-4 [&_svg]:w-4">
              <WebsiteImportIcon />
            </span>
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

        {/* ── Main product card (boardui data-table) ── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
        >
          <ProductsDataTable
            products={allProducts}
            isAdmin={isAdmin}
            isLoading={isLoading}
            onAddProduct={() => navigate("/products/new")}
            onEditProduct={(id) => navigate(`/products/${id}/edit`)}
          />
        </motion.div>
      </div>
    </div>
  );
}
