import { ArrowClockwise, MagnifyingGlass, Package, Plus, WarningCircle } from "@phosphor-icons/react";
import {
  catalogImage,
  formatTaka,
  matchesCatalogSearch,
  variantLabel,
  type CatalogProduct,
  type CatalogVariant,
} from "@/lib/orderEditor";

type CatalogPanelProps = {
  products: CatalogProduct[];
  search: string;
  loading: boolean;
  error: boolean;
  canEdit: boolean;
  locked: boolean;
  onSearch: (search: string) => void;
  onRetry: () => void;
  onAdd: (product: CatalogProduct, variant?: CatalogVariant) => void;
};

function stockLabel(stock: number) {
  if (stock <= 0) return "Out of stock";
  return `${stock} available`;
}

export function CatalogPanel({ products, search, loading, error, canEdit, locked, onSearch, onRetry, onAdd }: CatalogPanelProps) {
  const filtered = products.filter((product) => matchesCatalogSearch(product, search));

  return (
    <section aria-label="Product catalog" className="flex min-h-0 flex-col bg-[#FAFAF8] p-5">
      <div>
        <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">Product catalog</p>
        <h2 className="mt-2 text-xl font-light text-black">Add products</h2>
      </div>
      {locked && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">Editing is locked after courier dispatch.</p>}
      <label className="relative mt-5 block">
        <span className="sr-only">Search products</span>
        <MagnifyingGlass weight="light" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
        <input type="search" aria-label="Search products" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search name, slug, or variant" className="h-11 w-full rounded-lg bg-black/[0.04] pl-10 pr-3 text-[13px] outline-none ring-1 ring-inset ring-black/[0.06] transition focus:bg-white focus:ring-black/20" />
      </label>

      <div className="mt-4 min-h-0 space-y-3 xl:overflow-y-auto xl:pr-1">
        {loading ? <p className="py-12 text-center text-[13px] text-black/45">Loading catalog…</p> : error ? (
          <div className="grid place-items-center gap-3 py-12 text-center">
            <WarningCircle weight="light" size={24} className="text-red-500" />
            <p className="text-[13px] text-black/55">Could not load the product catalog.</p>
            <button type="button" onClick={onRetry} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-black px-3 text-[12px] text-white"><ArrowClockwise weight="light" size={15} /> Retry</button>
          </div>
        ) : filtered.length === 0 ? <p className="py-12 text-center text-[13px] text-black/45">No products match your search.</p> : filtered.map((product) => {
          const image = catalogImage(product);
          return (
            <article key={product.id} className="rounded-lg bg-white p-3 ring-1 ring-inset ring-black/[0.06]">
              <div className="flex gap-3">
                <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/[0.04]">
                  {image ? <img src={image} alt={product.name} className="h-full w-full object-cover" /> : <Package weight="light" size={20} className="text-black/25" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14px] font-medium text-black">{product.name}</h3>
                  {product.slug && <p className="mt-0.5 truncate font-mono text-[10px] text-black/35">{product.slug}</p>}
                  {product.variants.length === 0 && <div className="mt-2 flex items-center justify-between gap-2"><div><p className="font-mono text-[13px] tabular-nums">{formatTaka(product.selling_price)}</p><p className="text-[10px] text-black/40">{product.weight_kg ? `${product.weight_kg} kg · ` : ""}{stockLabel(product.stock_quantity)}</p></div><button type="button" aria-label={`Add ${product.name} to cart`} onClick={() => onAdd(product)} disabled={!canEdit || product.stock_quantity <= 0} className="grid h-9 w-9 place-items-center rounded-lg bg-black text-white disabled:cursor-not-allowed disabled:opacity-25"><Plus weight="light" size={16} /></button></div>}
                </div>
              </div>
              {product.variants.length > 0 && <div className="mt-3 space-y-2 border-t border-black/[0.06] pt-3">{product.variants.map((variant) => {
                const label = variantLabel(variant.attributes);
                const price = (product.selling_price || 0) + (variant.price_adjustment || 0);
                return <div key={variant.id} className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-[12px] text-black">{label || "Default variant"}</p><p className="mt-0.5 text-[10px] text-black/40">{formatTaka(price)}{variant.weight_kg ? ` · ${variant.weight_kg} kg` : ""} · {stockLabel(variant.stock_quantity)}</p></div><button type="button" aria-label={`Add ${product.name}, ${label || "Default variant"} to cart`} onClick={() => onAdd(product, variant)} disabled={!canEdit || variant.stock_quantity <= 0} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black text-white disabled:cursor-not-allowed disabled:opacity-25"><Plus weight="light" size={15} /></button></div>;
              })}</div>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
