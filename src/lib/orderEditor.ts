export type DiscountType = "fixed" | "percentage";

export type CatalogVariant = {
  id: string;
  product_id?: string | null;
  attributes: Record<string, string>;
  price_adjustment?: number | null;
  stock_quantity: number;
  weight_kg?: number | null;
};

export type CatalogImage = {
  url?: string | null;
  image_url?: string | null;
  is_primary?: boolean | null;
  sort_order?: number | null;
};

export type CatalogProduct = {
  id: string;
  name: string;
  slug?: string | null;
  selling_price: number | null;
  stock_quantity: number;
  weight_kg?: number | null;
  image_url?: string | null;
  images?: CatalogImage[];
  variants: CatalogVariant[];
};

export type OrderEditorItem = {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string | null;
  variant_name: string | null;
  product_slug?: string | null;
  image_url?: string | null;
  weight_kg?: number | null;
  available_stock?: number | null;
  unit_price: number;
  discount_type: DiscountType | null;
  discount_value: number;
  unit_discount: number;
  quantity: number;
};

export type CartTotals = {
  quantity: number;
  grossSubtotal: number;
  itemDiscount: number;
  legacyDiscount: number;
  aggregateDiscount: number;
  netMerchandiseTotal: number;
  deliveryFee: number;
  finalTotal: number;
};

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function roundTaka(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatTaka(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `৳${Number(value).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}

export function calculateUnitDiscount(
  unitPrice: number,
  discountType: DiscountType | null,
  discountValue: number,
): number {
  const price = finiteNonNegative(unitPrice);
  const value = finiteNonNegative(discountValue);
  if (discountType === "fixed") return roundTaka(Math.min(price, value));
  if (discountType === "percentage") {
    return roundTaka(price * Math.min(100, value) / 100);
  }
  return 0;
}

export function calculateCartTotals(
  items: OrderEditorItem[],
  deliveryFee = 0,
  legacyDiscount = 0,
): CartTotals {
  const quantity = items.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
  const grossSubtotal = roundTaka(items.reduce(
    (sum, item) => sum + finiteNonNegative(item.unit_price) * Math.max(0, item.quantity),
    0,
  ));
  const itemDiscount = roundTaka(items.reduce(
    (sum, item) => sum + calculateUnitDiscount(
      item.unit_price,
      item.discount_type,
      item.discount_value,
    ) * Math.max(0, item.quantity),
    0,
  ));
  const safeLegacyDiscount = roundTaka(finiteNonNegative(legacyDiscount));
  const aggregateDiscount = roundTaka(itemDiscount + safeLegacyDiscount);
  const netMerchandiseTotal = roundTaka(Math.max(0, grossSubtotal - aggregateDiscount));
  const safeDeliveryFee = roundTaka(finiteNonNegative(deliveryFee));

  return {
    quantity,
    grossSubtotal,
    itemDiscount,
    legacyDiscount: safeLegacyDiscount,
    aggregateDiscount,
    netMerchandiseTotal,
    deliveryFee: safeDeliveryFee,
    finalTotal: roundTaka(netMerchandiseTotal + safeDeliveryFee),
  };
}

export function variantLabel(attributes: Record<string, string>): string {
  return Object.values(attributes).filter(Boolean).join(" · ");
}

export function catalogImage(product: CatalogProduct): string | null {
  if (product.image_url) return product.image_url;
  const primary = product.images?.find((image) => image.is_primary);
  return primary?.url || primary?.image_url || product.images?.[0]?.url || product.images?.[0]?.image_url || null;
}

export function matchesCatalogSearch(product: CatalogProduct, search: string): boolean {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return true;
  const searchable = [
    product.name,
    product.slug || "",
    ...product.variants.flatMap((variant) => Object.values(variant.attributes)),
  ].join(" ").toLocaleLowerCase();
  return searchable.includes(query);
}

export function upsertCartItem(
  items: OrderEditorItem[],
  product: CatalogProduct,
  variant?: CatalogVariant,
): OrderEditorItem[] {
  const variantId = variant?.id || null;
  const existingIndex = items.findIndex(
    (item) => item.product_id === product.id && item.variant_id === variantId,
  );
  if (existingIndex >= 0) {
    return items.map((item, index) => index === existingIndex
      ? {
          ...item,
          quantity: item.available_stock == null
            ? item.quantity + 1
            : Math.min(item.available_stock, item.quantity + 1),
        }
      : item);
  }

  const basePrice = finiteNonNegative(product.selling_price || 0);
  const unitPrice = roundTaka(basePrice + finiteNonNegative(variant?.price_adjustment || 0));
  return [...items, {
    id: `draft-${product.id}-${variantId || "product"}`,
    product_id: product.id,
    variant_id: variantId,
    product_name: product.name,
    variant_name: variant ? variantLabel(variant.attributes) : null,
    product_slug: product.slug || null,
    image_url: catalogImage(product),
    weight_kg: variant?.weight_kg ?? product.weight_kg ?? null,
    available_stock: variant?.stock_quantity ?? product.stock_quantity,
    unit_price: unitPrice,
    discount_type: null,
    discount_value: 0,
    unit_discount: 0,
    quantity: 1,
  }];
}
