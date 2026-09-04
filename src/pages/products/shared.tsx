import { useState } from "react";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { FileUpload } from "@/components/base/file-upload/file-upload";
import { Trash2 } from "lucide-react";

// ── Shared product types / helpers ──────────────────────────────────────────
// Extracted from Products.tsx so the list page and the dedicated Add/Edit
// pages (ProductNew / ProductEdit) share one source of truth.

export type ProductVariant = {
  id: string;
  product_id: string;
  attributes: Record<string, string>;
  cog: number;
  stock_quantity: number;
  price_adjustment: number;
  weight_kg: number | null;
  org_id: string | null;
  created_at: string;
};

export type ProductImage = {
  id: string;
  url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
};

export type Product = {
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
  weight_kg: number | null;
  warehouse_id: string | null;
  source_url: string | null;
  published: boolean;
  published_at: string | null;
  created_at: string;
  variants: ProductVariant[];
  images: ProductImage[];
};

export type ProductsResponse = {
  storefront?: {
    id: string;
    products_url: string;
  };
  products: Product[];
};

function formatTaka(n: number | null | undefined) {
  if (n == null) return "—";
  return "৳" + Number(n).toLocaleString("en-BD", { minimumFractionDigits: 0 });
}

function variantPrice(product: Product, variant: Pick<ProductVariant, "price_adjustment">) {
  if (product.selling_price == null) return null;
  return product.selling_price + (variant.price_adjustment || 0);
}

export function variantPriceDisplay(product: Product, variant: Pick<ProductVariant, "price_adjustment">) {
  return formatTaka(variantPrice(product, variant));
}

export function productPriceDisplay(product: Product) {
  return productPriceDisplayLines(product).join(" / ");
}

export function productPriceDisplayLines(product: Product) {
  if (product.variants.length === 0) return [formatTaka(product.selling_price)];
  if (product.selling_price == null) return ["—"];

  const prices = product.variants
    .map((variant) => variantPrice(product, variant))
    .filter((price): price is number => price != null)
    .filter((price, index, all) => all.indexOf(price) === index)
    .sort((a, b) => a - b);

  return prices.length > 0 ? prices.map(formatTaka) : [formatTaka(product.selling_price)];
}

export function productPriceSortValue(product: Product) {
  if (product.variants.length === 0) return product.selling_price ?? -1;
  if (product.selling_price == null) return -1;
  return Math.min(...product.variants.map((variant) => variantPrice(product, variant) ?? -1));
}

export type SelectedImage = {
  id: string;
  file: File;
  dataUrl: string;
};

// ── Shopify-style option / combination model (Add Product) ──────────────────
export type ProductOption = { id: string; name: string; values: string[] };
export type ComboFields = { stock: string; price: string; cog: string; weight: string };

export function activeOptions(options: ProductOption[]): ProductOption[] {
  return options.filter((o) => o.name.trim() && o.values.length > 0);
}

// Cartesian product of the active options → one attributes object per combination.
export function buildCombinations(options: ProductOption[]): Record<string, string>[] {
  const act = activeOptions(options);
  if (!act.length) return [];
  return act.reduce<Record<string, string>[]>(
    (acc, opt) => acc.flatMap((row) => opt.values.map((v) => ({ ...row, [opt.name.trim().toLowerCase()]: v }))),
    [{}],
  );
}

export const comboKey = (attrs: Record<string, string>) => Object.values(attrs).join(" / ");

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

export async function uploadSelectedProductImages(productId: string, selectedImages: SelectedImage[], altText: string) {
  for (const image of selectedImages) {
    const res = await apiFetch(`/api/products/${productId}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [{
          dataUrl: image.dataUrl,
          mimeType: image.file.type,
          alt_text: altText,
        }],
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to upload product images");
  }
}

// Textarea styled to match the Board UI <Input> shell (theme.css tokens).
export const BUI_TEXTAREA_CLS =
  "min-h-24 w-full rounded-2lg bg-background-tertiary-default px-3 py-2 text-body-regular text-text-primary outline-none ring-2 ring-inset ring-transparent transition-[background-color,box-shadow] duration-[var(--input-transition-ms)] ease placeholder:text-text-tertiary focus:ring-border-button-active";

// Section heading above a group of Board UI fields.
export function FormSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">
      {children}
    </p>
  );
}

export function ProductImageManager({ product, onChanged }: { product: Product; onChanged: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const images = product.images ?? [];

  async function uploadImageFile(uploaded: File) {
    if (images.length >= 8) {
      toast.error("You can add up to 8 images");
      return;
    }
    setSaving(true);
    try {
      const dataUrl = await readFileAsDataUrl(uploaded);
      await uploadSelectedProductImages(product.id, [{ id: crypto.randomUUID(), file: uploaded, dataUrl }], product.name);
      await onChanged();
      toast.success("Image uploaded");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to upload image");
    } finally {
      setSaving(false);
    }
  }

  async function deleteImage(imageId: string) {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/products/${product.id}/images/${imageId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to delete image");
      await onChanged();
      toast.success("Image removed");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove image");
    } finally {
      setSaving(false);
    }
  }

  async function moveImage(imageId: string, direction: -1 | 1) {
    const index = images.findIndex((image) => image.id === imageId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= images.length) return;
    const next = images.map((image) => image.id);
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setSaving(true);
    try {
      const res = await apiFetch(`/api/products/${product.id}/images/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to reorder images");
      await onChanged();
      toast.success("Images reordered");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to reorder images");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[14px] border border-black/[0.08] bg-white p-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">Images</p>
        <p className="text-[12px] text-black/40">First image is used as the public catalog thumbnail. Move images to reorder.</p>
      </div>
      <div className="mt-3">
        <FileUpload allowedExtensions={["jpg", "jpeg", "png", "webp"]} onUploadComplete={uploadImageFile} />
      </div>
      {images.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {images.map((image, index) => (
            <div key={image.id} className="group relative aspect-square overflow-hidden rounded-xl border border-black/[0.08] bg-black/[0.03]">
              <img src={image.url} alt={image.alt_text || product.name} className="h-full w-full object-cover" />
              {index === 0 && <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black">Primary</span>}
              <button
                type="button"
                disabled={saving}
                onClick={() => deleteImage(image.id)}
                aria-label={`Remove ${image.alt_text || product.name}`}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-red-500 shadow-sm transition-colors hover:bg-red-50 disabled:opacity-30"
              >
                <Trash2 className="h-3 w-3" />
              </button>
              <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button type="button" disabled={saving || index === 0} onClick={() => moveImage(image.id, -1)} className="rounded-md bg-white/90 px-1.5 py-1 text-[10px] font-semibold text-black/60 disabled:opacity-30">Left</button>
                <button type="button" disabled={saving || index === images.length - 1} onClick={() => moveImage(image.id, 1)} className="rounded-md bg-white/90 px-1.5 py-1 text-[10px] font-semibold text-black/60 disabled:opacity-30">Right</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
