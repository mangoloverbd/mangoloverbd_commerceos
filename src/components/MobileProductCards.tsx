import type { ReactNode } from "react";
import { Check, DotsThree, Package, PencilSimple } from "@phosphor-icons/react";
import type { Product } from "@/pages/products/shared";
import { cn } from "@/lib/utils";

type MobileProductCardsProps = {
  products: Product[];
  selectedProductIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onEditProduct: (id: string) => void;
  renderActions: (product: Product) => ReactNode;
};

function priceLabel(product: Product) {
  if (product.selling_price == null) return "—";
  return `৳${Number(product.selling_price).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

function stockLabel(product: Product) {
  if (product.variants.length) return `${product.variants.reduce((total, variant) => total + variant.stock_quantity, 0)} across ${product.variants.length} variants`;
  return `${product.stock_quantity} units`;
}

function stockClass(product: Product) {
  const stock = product.variants.length ? product.variants.reduce((total, variant) => total + variant.stock_quantity, 0) : product.stock_quantity;
  return stock === 0 ? "text-red-600" : stock <= 5 ? "text-amber-700" : "text-emerald-700";
}

export function MobileProductCards({ products, selectedProductIds, onToggleSelection, onEditProduct, renderActions }: MobileProductCardsProps) {
  if (!products.length) return <div className="px-5 py-20 text-center text-sm text-black/45">No products match your filters.</div>;

  return (
    <div className="space-y-3 p-3" data-testid="mobile-product-cards">
      {products.map((product) => {
        const selected = selectedProductIds.has(product.id);
        const actions = renderActions(product);
        return (
          <article key={product.id} className={cn("rounded-2xl border bg-white p-4", selected ? "border-blue-300 bg-blue-50/30" : "border-black/[0.08]")}>
            <div className="flex items-start gap-3">
              <label className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
                <input type="checkbox" checked={selected} onChange={() => onToggleSelection(product.id)} className="h-5 w-5 accent-black" aria-label={`Select product ${product.name}`} />
              </label>
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {product.image_url ? <img src={product.image_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black/[0.05] text-black/35"><Package weight="light" size={22} /></span>}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-black">{product.name}</p>
                  <p className="mt-1 text-[11px] text-black/40">{product.published ? "Published" : "Draft"}</p>
                </div>
              </div>
              <button type="button" onClick={() => onEditProduct(product.id)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-black/50 hover:bg-black/[0.05] hover:text-black" aria-label={`Edit ${product.name}`}>
                <PencilSimple weight="light" size={19} />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-black/[0.06] pt-3">
              <div><p className="text-[9px] uppercase tracking-[0.2em] text-black/40">Price</p><p className="mt-1 text-sm font-semibold tabular-nums text-black">{priceLabel(product)}</p></div>
              <div><p className="text-[9px] uppercase tracking-[0.2em] text-black/40">Stock</p><p className={cn("mt-1 text-sm font-semibold tabular-nums", stockClass(product))}>{stockLabel(product)}</p></div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-black/45">
              <span>COG ৳{Number(product.cog || 0).toLocaleString("en-BD")}</span>
              <span className="inline-flex items-center gap-1">{product.published ? <Check weight="light" size={14} /> : <DotsThree weight="light" size={14} />} {product.published ? "Live" : "Draft"}</span>
            </div>
            {actions && <div className="mt-3 border-t border-black/[0.06] pt-3">{actions}</div>}
          </article>
        );
      })}
    </div>
  );
}
