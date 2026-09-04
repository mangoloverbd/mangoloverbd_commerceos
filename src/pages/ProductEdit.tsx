import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { Input as BuiInput } from "@/components/base/input/input";
import { Checkbox as BuiCheckbox } from "@/components/base/checkbox/checkbox";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { Select as BuiSelect, SelectItem as BuiSelectItem } from "@/components/base/select/select";
import { RichButton } from "@/components/ui/rich-button";
import { Spinner } from "@/components/ui/ios-spinner";
import { Check, ArrowLeft, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWarehouses } from "@/hooks/useWarehouses";
import {
  type Product,
  type ProductVariant,
  type ProductsResponse,
  BUI_TEXTAREA_CLS,
  FormSectionLabel,
  ProductImageManager,
  variantPriceDisplay,
} from "./products/shared";

const EDIT_INPUT_CLS =
  "h-9 w-full rounded-[12px] border border-black/[0.1] bg-black/[0.04] px-3 font-mono text-[13px] text-black outline-none tabular-nums transition-colors focus-visible:ring-1 focus-visible:ring-black/20 focus:bg-white placeholder:text-black/25";

function attrLabel(attributes: Record<string, string>) {
  return Object.values(attributes).filter(Boolean).join(" · ");
}

function VariantEditorRow({ product, variant }: { product: Product; variant: ProductVariant }) {
  const qc = useQueryClient();
  const [stock, setStock] = useState(String(variant.stock_quantity));
  const [cog, setCog] = useState(String(variant.cog));
  const [priceAdj, setPriceAdj] = useState(String(variant.price_adjustment ?? 0));
  const [weight, setWeight] = useState(variant.weight_kg == null ? "" : String(variant.weight_kg));
  const [saving, setSaving] = useState(false);

  async function saveVariant() {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/products/${product.id}/variants/${variant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stock_quantity: Math.max(0, parseInt(stock, 10) || 0),
          cog: parseFloat(cog) || 0,
          price_adjustment: parseFloat(priceAdj) || 0,
          weight_kg: weight === "" ? null : Number(weight),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to save variant");
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      toast.success("Variant saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save variant");
    } finally {
      setSaving(false);
    }
  }

  async function deleteVariant() {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/products/${product.id}/variants/${variant.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to delete variant");
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      toast.success("Variant removed");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete variant");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-[14px] border border-black/[0.08] bg-white p-3 md:grid-cols-[1fr_100px_100px_110px_110px_110px_auto] md:items-end">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-black/40">Variant</p>
        <p className="mt-1 text-[14px] font-medium text-black">{attrLabel(variant.attributes)}</p>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-black/40">Price</p>
        <p className="h-9 pt-2 font-mono text-[13px] tabular-nums text-black">{variantPriceDisplay(product, { price_adjustment: parseFloat(priceAdj) || 0 })}</p>
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-black/40">Stock</label>
        <input type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} className={EDIT_INPUT_CLS} />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-black/40">COG</label>
        <input type="number" min={0} value={cog} onChange={(e) => setCog(e.target.value)} className={EDIT_INPUT_CLS} />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-black/40">Price ±</label>
        <input type="number" value={priceAdj} onChange={(e) => setPriceAdj(e.target.value)} className={EDIT_INPUT_CLS} />
      </div>
      <div>
        <label htmlFor={`variant-weight-${variant.id}`} className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-black/40">Weight</label>
        <input id={`variant-weight-${variant.id}`} aria-label={`Weight for ${attrLabel(variant.attributes)}`} type="number" min={0} step="0.001" value={weight} onChange={(e) => setWeight(e.target.value)} className={EDIT_INPUT_CLS} />
      </div>
      <div className="flex gap-2">
        <RichButton aria-label={`Save variant ${attrLabel(variant.attributes)}`} color="default" size="default" type="button" onClick={saveVariant} disabled={saving} className="h-9 rounded-[8px] px-3">
          {saving ? <Spinner size="sm" /> : "Save"}
        </RichButton>
        <button type="button" onClick={deleteVariant} disabled={saving} className="flex h-9 w-9 items-center justify-center rounded-[8px] text-black/40 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function AddVariantForm({ product }: { product: Product }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState([{ key: "", value: "" }]);
  const [stock, setStock] = useState("0");
  const [cog, setCog] = useState("0");
  const [priceAdj, setPriceAdj] = useState("0");
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);

  function setRow(index: number, field: "key" | "value", value: string) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  }

  async function addVariant() {
    const attributes: Record<string, string> = {};
    for (const row of rows) {
      const key = row.key.trim().toLowerCase();
      const value = row.value.trim();
      if (key && value) attributes[key] = value;
    }
    if (Object.keys(attributes).length === 0) {
      toast.error("Add at least one variant attribute");
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch(`/api/products/${product.id}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attributes,
          stock_quantity: Math.max(0, parseInt(stock, 10) || 0),
          cog: parseFloat(cog) || 0,
          price_adjustment: parseFloat(priceAdj) || 0,
          weight_kg: weight === "" ? null : Number(weight),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to add variant");
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      setRows([{ key: "", value: "" }]);
      setStock("0");
      setCog("0");
      setPriceAdj("0");
      setWeight("");
      toast.success("Variant added");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add variant");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[14px] border border-dashed border-black/[0.12] bg-black/[0.02] p-3">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">Add variant</p>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <input type="text" placeholder="attribute" value={row.key} onChange={(e) => setRow(index, "key", e.target.value)} className={cn(EDIT_INPUT_CLS, "max-w-[160px]")} />
            <span className="text-black/25">:</span>
            <input type="text" placeholder="value" value={row.value} onChange={(e) => setRow(index, "value", e.target.value)} className={EDIT_INPUT_CLS} />
            {rows.length > 1 && (
              <button type="button" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="rounded-lg p-1 text-black/40 hover:text-red-500">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setRows((current) => [...current, { key: "", value: "" }])} className="mt-2 flex items-center gap-1.5 text-[12px] text-black/40 hover:text-black">
        <Plus className="h-3 w-3" /> Add attribute
      </button>
      <div className="mt-3 grid gap-3 md:grid-cols-[100px_100px_110px_120px_auto] md:items-end">
        <BuiInput label="Stock" type="number" value={stock} onChange={setStock} placeholder="0" />
        <BuiInput label="COG (৳)" type="number" value={cog} onChange={setCog} placeholder="0" />
        <BuiInput label="Price ±" type="number" value={priceAdj} onChange={setPriceAdj} placeholder="0" />
        <BuiInput label="New variant weight (kg)" type="number" min={0} value={weight} onChange={setWeight} placeholder="0" />
        <RichButton color="default" size="default" type="button" onClick={addVariant} disabled={saving} className="h-9 rounded-[8px]">
          <span className="flex items-center gap-2">{saving ? <Spinner size="sm" /> : <Plus className="h-4 w-4" />}Add variant</span>
        </RichButton>
      </div>
    </div>
  );
}

function ProductVariantsEditor({ product }: { product: Product }) {
  return (
    <div className="mt-4 rounded-[14px] border border-black/[0.08] bg-white p-3">
      <div className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">Existing variants</p>
        <p className="text-[12px] text-black/40">Click a product row to manage variant stock, cost, and price adjustments here.</p>
      </div>
      <div className="space-y-2">
        {product.variants.length > 0 ? product.variants.map((variant) => (
          <VariantEditorRow key={variant.id} product={product} variant={variant} />
        )) : (
          <p className="rounded-[12px] bg-black/[0.03] px-3 py-4 text-[13px] text-black/45">No variants yet.</p>
        )}
      </div>
      <div className="mt-3">
        <AddVariantForm product={product} />
      </div>
    </div>
  );
}

function EditForm({ product }: { product: Product }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { warehouses } = useWarehouses();
  const [name, setName] = useState(product.name || "");
  const [description, setDescription] = useState(product.description || "");
  const [sellingPrice, setSellingPrice] = useState(product.selling_price == null ? "" : String(product.selling_price));
  const [compareAtPrice, setCompareAtPrice] = useState(product.compare_at_price == null ? "" : String(product.compare_at_price));
  const [cog, setCog] = useState(String(product.cog ?? 0));
  const [stock, setStock] = useState(String(product.stock_quantity ?? 0));
  const [weight, setWeight] = useState(product.weight_kg == null ? "" : String(product.weight_kg));
  const [warehouseId, setWarehouseId] = useState(product.warehouse_id || "");
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
          selling_price: sellingPrice ? parseFloat(sellingPrice) || 0 : null,
          compare_at_price: compareAtPrice ? parseFloat(compareAtPrice) || 0 : null,
          cog: parseFloat(cog) || 0,
          stock_quantity: Math.max(0, parseInt(stock, 10) || 0),
          weight_kg: weight === "" ? null : Number(weight),
          warehouse_id: warehouseId || null,
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
          <BuiInput label="Selling price (৳)" type="number" value={sellingPrice} onChange={setSellingPrice} placeholder="0" />
          <BuiInput label="Compare-at price (৳)" type="number" value={compareAtPrice} onChange={setCompareAtPrice} placeholder="0" />
          <BuiInput label="COG (৳)" type="number" value={cog} onChange={setCog} placeholder="0" />
          <BuiInput label="Stock quantity" type="number" value={stock} onChange={setStock} placeholder="0" />
          <BuiInput label="Weight (kg)" type="number" min={0} value={weight} onChange={setWeight} placeholder="0" />
          <div className="flex flex-col justify-end space-y-1.5">
            <FormSectionLabel>Warehouse</FormSectionLabel>
            <BuiSelect aria-label="Warehouse" selectedKey={warehouseId || null} onSelectionChange={(key) => setWarehouseId(String(key))}>
              {warehouses.map((warehouse) => (
                <BuiSelectItem key={warehouse.id} id={warehouse.id} textValue={warehouse.name}>{warehouse.name}</BuiSelectItem>
              ))}
            </BuiSelect>
          </div>
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

        <ProductVariantsEditor product={product} />

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
