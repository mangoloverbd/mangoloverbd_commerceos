import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { Input as BuiInput } from "@/components/base/input/input";
import { Select as BuiSelect, SelectItem as BuiSelectItem } from "@/components/base/select/select";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { FileUpload } from "@/components/base/file-upload/file-upload";
import { RichButton } from "@/components/ui/rich-button";
import { Spinner } from "@/components/ui/ios-spinner";
import { Plus, Trash2, X, ArrowLeft } from "lucide-react";
import {
  type ProductOption,
  type ComboFields,
  type SelectedImage,
  BUI_TEXTAREA_CLS,
  FormSectionLabel,
  buildCombinations,
  comboKey,
  readFileAsDataUrl,
  uploadSelectedProductImages,
} from "./products/shared";

export default function ProductNew() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [cog, setCog] = useState("");
  const [stock, setStock] = useState("");
  const [published, setPublished] = useState(false);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [comboData, setComboData] = useState<Record<string, ComboFields>>({});
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [saving, setSaving] = useState(false);

  const combinations = useMemo(() => buildCombinations(options), [options]);
  const hasVariants = combinations.length > 0;

  function addOption() {
    if (options.length >= 3) return;
    setOptions((current) => [...current, { id: crypto.randomUUID(), name: "", values: [] }]);
  }

  function updateOption(id: string, patch: Partial<ProductOption>) {
    setOptions((current) => current.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function removeOption(id: string) {
    setOptions((current) => current.filter((o) => o.id !== id));
  }

  function addOptionValue(id: string, raw: string) {
    const value = raw.trim();
    if (!value) return;
    setOptions((current) =>
      current.map((o) =>
        o.id === id && !o.values.some((v) => v.toLowerCase() === value.toLowerCase())
          ? { ...o, values: [...o.values, value] }
          : o,
      ),
    );
  }

  function removeOptionValue(id: string, value: string) {
    setOptions((current) => current.map((o) => (o.id === id ? { ...o, values: o.values.filter((v) => v !== value) } : o)));
  }

  function updateCombo(key: string, patch: Partial<ComboFields>) {
    setComboData((current) => ({ ...current, [key]: { stock: "", price: "", cog: "", ...current[key], ...patch } }));
  }

  async function addImageFile(uploaded: File) {
    if (selectedImages.length >= 8) {
      toast.error("You can add up to 8 images");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(uploaded);
      setSelectedImages((current) =>
        current.length >= 8
          ? current
          : [...current, { id: crypto.randomUUID(), file: uploaded, dataUrl }],
      );
    } catch {
      toast.error("Failed to read selected image");
    }
  }

  async function uploadProductImages(productId: string) {
    if (!selectedImages.length) return;
    await uploadSelectedProductImages(productId, selectedImages, name.trim());
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Product name is required");
      return;
    }
    setSaving(true);
    try {
      const generatedVariants = combinations.map((attrs) => {
        const d = comboData[comboKey(attrs)] ?? { stock: "", price: "", cog: "" };
        const px = d.price || sellingPrice;
        return {
          attributes: attrs,
          cog: parseFloat(d.cog || cog) || 0,
          stock_quantity: Math.max(0, parseInt(d.stock || "0", 10) || 0),
          selling_price: px ? parseFloat(px) || 0 : null,
        };
      });

      const res = await apiFetch("/api/products/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: "manual",
          products: [{
            name: name.trim(),
            description: description.trim() || null,
            image_url: null,
            url: null,
            selling_price: sellingPrice ? parseFloat(sellingPrice) || 0 : null,
            compare_at_price: compareAtPrice ? parseFloat(compareAtPrice) || 0 : null,
            cog: parseFloat(cog) || 0,
            stock_quantity: Math.max(0, parseInt(stock, 10) || 0),
            published,
            variants: generatedVariants,
          }],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to add product");
      const productId = json.products?.[0]?.id;
      if (productId) await uploadProductImages(productId);
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      toast.success(selectedImages.length ? "Product added with images" : published ? "Product added and published" : "Product added");
      navigate("/products");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full space-y-6 bg-white p-1 lg:p-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BuiButton variant="ghost" size="small" iconOnly leadingIcon={ArrowLeft} aria-label="Back" onClick={() => navigate("/products")} />
          <div>
            <h1 className="font-sf-display text-[22px] font-bold tracking-tight text-black">Add Product</h1>
            <p className="mt-1 text-[13px] text-black/45">Create a product manually, then publish it to the public catalog.</p>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-4"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <BuiInput data-testid="input-manual-product-name" label="Product name" isRequired value={name} onChange={setName} placeholder="e.g. Cotton Panjabi" />
          <BuiInput data-testid="input-manual-product-selling-price" label="Selling price (৳)" type="number" value={sellingPrice} onChange={setSellingPrice} placeholder="0" />
          <BuiInput data-testid="input-manual-product-compare-at-price" label="Compare-at price (৳)" type="number" value={compareAtPrice} onChange={setCompareAtPrice} placeholder="0" />
          <BuiInput data-testid="input-manual-product-cog" label="COG (৳)" type="number" value={cog} onChange={setCog} placeholder="0" />
          {!hasVariants && (
            <BuiInput data-testid="input-manual-product-stock" label="Stock quantity" type="number" value={stock} onChange={setStock} placeholder="0" />
          )}
          <div className="flex flex-col justify-end space-y-1.5">
            <FormSectionLabel>Status</FormSectionLabel>
            <BuiSelect
              aria-label="Publish status"
              triggerClassName="h-9"
              selectedKey={published ? "publish" : "draft"}
              onSelectionChange={(k) => setPublished(k === "publish")}
            >
              <BuiSelectItem id="publish" textValue="Publish Now">Publish Now</BuiSelectItem>
              <BuiSelectItem id="draft" textValue="Draft">Draft</BuiSelectItem>
            </BuiSelect>
          </div>
        </div>

        <div className="space-y-1.5">
          <FormSectionLabel>Description</FormSectionLabel>
          <textarea
            data-testid="input-manual-product-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Short description shown on the storefront"
            className={BUI_TEXTAREA_CLS}
          />
        </div>

        <div className="space-y-3 rounded-2lg border border-border-secondary bg-background-primary-default p-3">
          <div>
            <FormSectionLabel>Images</FormSectionLabel>
            <p className="mt-0.5 text-caption-1-medium text-text-tertiary">Upload up to 8 product images. The first image becomes the public catalog thumbnail.</p>
          </div>
          <FileUpload
            allowedExtensions={["jpg", "jpeg", "png", "webp"]}
            onUploadComplete={addImageFile}
          />
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
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="space-y-2.5"
      >
        <div className="flex items-center justify-between">
          <FormSectionLabel>Options</FormSectionLabel>
          <BuiButton data-testid="button-add-option" variant="secondary" size="small" leadingIcon={Plus} onClick={addOption} disabled={options.length >= 3}>
            Add option
          </BuiButton>
        </div>
        <p className="text-caption-1-medium text-text-tertiary">Add options like Color or Size (up to 3). Combinations are generated automatically below.</p>
        {options.map((opt) => (
          <div key={opt.id} className="grid items-start gap-2 rounded-2lg border border-border-secondary bg-background-primary-default p-3 md:grid-cols-[220px_1fr_36px]">
            <label className="space-y-1">
              <span className="block text-caption-1-medium text-text-tertiary">Option name</span>
              <BuiInput size="small" value={opt.name} onChange={(v) => updateOption(opt.id, { name: v })} placeholder="Color" />
            </label>
            <label className="space-y-1">
              <span className="block text-caption-1-medium text-text-tertiary">Values (type and press Enter)</span>
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-black/[0.1] bg-black/[0.04] px-2 py-1.5 min-h-9">
                {opt.values.map((v) => (
                  <Chip key={v} variant="caption" color="gray" className="gap-1">
                    {v}
                    <button type="button" onClick={() => removeOptionValue(opt.id, v)} aria-label={`Remove ${v}`} className="text-text-tertiary hover:text-text-error-primary">
                      <X className="h-3 w-3" />
                    </button>
                  </Chip>
                ))}
                <input
                  type="text"
                  placeholder={opt.values.length ? "" : "Black"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addOptionValue(opt.id, e.currentTarget.value); e.currentTarget.value = ""; }
                    else if (e.key === "Backspace" && !e.currentTarget.value && opt.values.length) { removeOptionValue(opt.id, opt.values[opt.values.length - 1]); }
                  }}
                  onBlur={(e) => { addOptionValue(opt.id, e.currentTarget.value); e.currentTarget.value = ""; }}
                  className="min-w-24 flex-1 bg-transparent text-[13px] text-black outline-none placeholder:text-black/25"
                />
              </div>
            </label>
            <BuiButton variant="ghost" size="small" iconOnly leadingIcon={Trash2} aria-label="Remove option" onClick={() => removeOption(opt.id)} className="mt-[22px] text-text-tertiary hover:text-text-error-primary" />
          </div>
        ))}

        {hasVariants && (
          <div className="space-y-2 pt-1">
            <FormSectionLabel>Variants ({combinations.length})</FormSectionLabel>
            {combinations.map((attrs) => {
              const key = comboKey(attrs);
              const d = comboData[key] ?? { stock: "", price: "", cog: "" };
              return (
                <div key={key} className="grid items-end gap-2 rounded-2lg border border-border-secondary bg-background-primary-default p-3 md:grid-cols-[1fr_110px_120px_110px]">
                  <div className="flex flex-wrap items-center gap-1.5 pb-1.5">
                    {Object.values(attrs).map((v, i) => <Chip key={i} variant="caption" color="gray">{v}</Chip>)}
                  </div>
                  <label className="space-y-1">
                    <span className="block text-caption-1-medium text-text-tertiary">Stock</span>
                    <BuiInput size="small" type="number" value={d.stock} onChange={(v) => updateCombo(key, { stock: v })} placeholder="0" />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-caption-1-medium text-text-tertiary">Price (৳)</span>
                    <BuiInput size="small" type="number" value={d.price} onChange={(v) => updateCombo(key, { price: v })} placeholder={sellingPrice || "0"} />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-caption-1-medium text-text-tertiary">COG (৳)</span>
                    <BuiInput size="small" type="number" value={d.cog} onChange={(v) => updateCombo(key, { cog: v })} placeholder={cog || "0"} />
                  </label>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2 pt-3">
          <RichButton color="default" size="default" type="button" onClick={submit} disabled={saving} className="h-9 rounded-[8px]">
            <span className="flex items-center gap-2">
              {saving ? <Spinner size="sm" /> : <Plus className="h-4 w-4" />}
              {saving ? "Saving…" : "Save product"}
            </span>
          </RichButton>
          <BuiButton variant="danger" size="medium" type="button" onClick={() => navigate("/products")} disabled={saving} className="h-9 rounded-[8px]">
            Cancel
          </BuiButton>
        </div>
      </motion.div>
    </div>
  );
}
