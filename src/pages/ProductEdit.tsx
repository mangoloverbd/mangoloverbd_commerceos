import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { Input as BuiInput } from "@/components/base/input/input";
import { Checkbox as BuiCheckbox } from "@/components/base/checkbox/checkbox";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { RichButton } from "@/components/ui/rich-button";
import { Spinner } from "@/components/ui/ios-spinner";
import { Check, ArrowLeft } from "lucide-react";
import {
  type Product,
  type ProductsResponse,
  BUI_TEXTAREA_CLS,
  FormSectionLabel,
  ProductImageManager,
} from "./products/shared";

function EditForm({ product }: { product: Product }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState(product.name || "");
  const [description, setDescription] = useState(product.description || "");
  const [imageUrl, setImageUrl] = useState(product.image_url || "");
  const [productUrl, setProductUrl] = useState(product.url || "");
  const [sellingPrice, setSellingPrice] = useState(product.selling_price == null ? "" : String(product.selling_price));
  const [compareAtPrice, setCompareAtPrice] = useState(product.compare_at_price == null ? "" : String(product.compare_at_price));
  const [cog, setCog] = useState(String(product.cog ?? 0));
  const [stock, setStock] = useState(String(product.stock_quantity ?? 0));
  const [published, setPublished] = useState(product.published === true);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) {
      toast.error("Product name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          image_url: imageUrl.trim() || null,
          url: productUrl.trim() || null,
          selling_price: sellingPrice ? parseFloat(sellingPrice) || 0 : null,
          compare_at_price: compareAtPrice ? parseFloat(compareAtPrice) || 0 : null,
          cog: parseFloat(cog) || 0,
          stock_quantity: Math.max(0, parseInt(stock, 10) || 0),
          published,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to save product");
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      toast.success("Product saved");
      navigate("/products");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-4"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <BuiInput data-testid={`input-edit-product-name-${product.id}`} label="Product name" isRequired value={name} onChange={setName} placeholder="Product name" />
          <BuiInput label="Fallback image URL" value={imageUrl} onChange={setImageUrl} placeholder="https://…" />
          <BuiInput label="Product URL" value={productUrl} onChange={setProductUrl} placeholder="https://…" />
          <BuiInput label="Selling price (৳)" type="number" value={sellingPrice} onChange={setSellingPrice} placeholder="0" />
          <BuiInput label="Compare-at price (৳)" type="number" value={compareAtPrice} onChange={setCompareAtPrice} placeholder="0" />
          <BuiInput label="COG (৳)" type="number" value={cog} onChange={setCog} placeholder="0" />
          <BuiInput label="Stock quantity" type="number" value={stock} onChange={setStock} placeholder="0" />
          <div className="flex items-end pb-2.5">
            <BuiCheckbox isSelected={published} onChange={setPublished}>Publish</BuiCheckbox>
          </div>
        </div>

        <div className="space-y-1.5">
          <FormSectionLabel>Description</FormSectionLabel>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Short description shown on the storefront"
            className={BUI_TEXTAREA_CLS}
          />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div className="mt-4">
          <ProductImageManager product={product} onChanged={async () => { await qc.invalidateQueries({ queryKey: ["/api/products"] }); }} />
        </div>

        <div className="mt-6 flex items-center gap-2">
          <RichButton color="default" size="default" type="button" onClick={submit} disabled={saving} className="h-9 rounded-[8px]">
            <span className="flex items-center gap-2">{saving ? <Spinner size="sm" /> : <Check className="h-4 w-4" />}{saving ? "Saving…" : "Save changes"}</span>
          </RichButton>
          <RichButton color="default" size="default" type="button" onClick={() => navigate("/products")} disabled={saving} className="bg-transparent shadow-none hover:bg-black/[0.05] text-text-secondary">Cancel</RichButton>
        </div>
      </motion.div>
    </>
  );
}

export default function ProductEdit() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery<ProductsResponse>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await apiFetch("/api/products");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      return res.json();
    },
  });
  const product = (data?.products ?? []).find((p) => p.id === id) ?? null;

  return (
    <div className="min-h-full space-y-6 bg-white p-1 lg:p-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BuiButton variant="ghost" size="small" iconOnly leadingIcon={ArrowLeft} aria-label="Back" onClick={() => navigate("/products")} />
          <div>
            <h1 className="font-sf-display text-[22px] font-bold tracking-tight text-black">Edit Product</h1>
            <p className="mt-1 text-[13px] text-black/45">{product?.name ?? ""}</p>
          </div>
        </div>
      </div>

      {isLoading && !product ? (
        <div className="grid place-items-center py-24">
          <Spinner size="md" />
        </div>
      ) : !product ? (
        <div className="py-24 text-center">
          <p className="text-[15px] font-medium text-black">Product not found.</p>
          <button type="button" onClick={() => navigate("/products")} className="mt-2 text-[13px] text-black/50 underline">
            Back to products
          </button>
        </div>
      ) : (
        <EditForm product={product} />
      )}
    </div>
  );
}
