import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/ios-spinner";
import { motion } from "framer-motion";
import { Copy, ExternalLink, Upload, Plus, Trash2 } from "lucide-react";

type ShippingZone = {
  id: string;
  name: string;
  price: number;
  min_order_amount: number;
  free_above: number;
  conditions: any[];
};

const DEFAULT_ZONES: ShippingZone[] = [
  { id: "zone_dhaka", name: "Inside Dhaka", price: 60, min_order_amount: 0, free_above: 1000, conditions: [] },
  { id: "zone_outside", name: "Outside Dhaka", price: 120, min_order_amount: 0, free_above: 2000, conditions: [] },
];

type StorefrontSettings = {
  enabled: boolean;
  storeName: string;
  tagline: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  backgroundColor: string;
  fontFamily: string;
  contactPhone: string | null;
  contactEmail: string | null;
  socialFacebook: string | null;
  socialInstagram: string | null;
  socialTiktok: string | null;
  seoTitleTemplate: string;
  seoDescriptionTemplate: string;
  shippingZones: ShippingZone[];
};

const DEFAULTS: StorefrontSettings = {
  enabled: false,
  storeName: "",
  tagline: "",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#000000",
  backgroundColor: "#FAFAF8",
  fontFamily: "Geist Sans",
  contactPhone: null,
  contactEmail: null,
  socialFacebook: null,
  socialInstagram: null,
  socialTiktok: null,
  seoTitleTemplate: "{product_name} | {store_name}",
  seoDescriptionTemplate: "{product_description}",
  shippingZones: [],
};

// ── Card row helper ──────────────────────────────────────────────────────────
function CardRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-black">{label}</p>
        {description && (
          <p className="text-[11px] text-black/40 mt-0.5">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-[17px] font-semibold text-black tracking-tight">
        {title}
      </h2>
      <p className="mt-0.5 text-[13px] text-black/45">{subtitle}</p>
    </div>
  );
}

// ── Read file as data URL ────────────────────────────────────────────────────
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Main component ───────────────────────────────────────────────────────────
export default function OnlineStore() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<StorefrontSettings>(DEFAULTS);
  const [handle, setHandle] = useState<string | null>(null);

  // Dirty tracking — tracks which fields have changed
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  // ── Load settings + handle ───────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, handleRes] = await Promise.all([
        apiFetch("/api/storefront/settings"),
        apiFetch("/api/storefront/handle"),
      ]);
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setSettings({ ...DEFAULTS, ...data.settings });
      }
      if (handleRes.ok) {
        const data = await handleRes.json();
        setHandle(data.handle || null);
      }
    } catch {
      toast.error("Failed to load storefront settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Update a field locally (marks it dirty) ─────────────────────────
  const updateField = <K extends keyof StorefrontSettings>(
    key: K,
    value: StorefrontSettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty((prev) => ({ ...prev, [key]: true }));
  };

  // ── Save all dirty fields ──────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/storefront/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save");
      setDirty({});
      toast.success("Storefront settings saved");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  // ── Logo upload ────────────────────────────────────────────────────
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    updateField("logoUrl", dataUrl);
    e.target.value = "";
  };

  // ── Shipping zone CRUD ────────────────────────────────────────────
  const zones = settings.shippingZones || [];

  const addZone = () => {
    const newZone: ShippingZone = {
      id: `zone_${Date.now()}`,
      name: "",
      price: 0,
      min_order_amount: 0,
      free_above: 0,
      conditions: [],
    };
    updateField("shippingZones", [...zones, newZone]);
  };

  const updateZone = (index: number, patch: Partial<ShippingZone>) => {
    const updated = zones.map((z, i) => (i === index ? { ...z, ...patch } : z));
    updateField("shippingZones", updated);
  };

  const removeZone = (index: number) => {
    updateField("shippingZones", zones.filter((_, i) => i !== index));
  };

  // Pre-populate default zones for new merchants (only if empty and no dirty state)
  useEffect(() => {
    if (!loading && zones.length === 0 && !dirty.shippingZones) {
      updateField("shippingZones", DEFAULT_ZONES);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const hasChanges = Object.values(dirty).some(Boolean);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

  const storefrontUrl = handle
    ? `https://merchant-suite.online/api/public/v1/${handle}/products`
    : null;

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-black tracking-tight">
            Online Store
          </h1>
          <p className="mt-1 text-[13px] text-black/45">
            Configure your public storefront — branding, appearance, and shipping.
          </p>
        </div>
        {hasChanges && (
          <motion.button
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-black px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save changes"}
          </motion.button>
        )}
      </div>

      {/* Storefront toggle + URL */}
      <div className="space-y-4">
        <SectionHeader
          title="Storefront"
          subtitle="Enable or disable your public storefront."
        />
        <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white divide-y divide-black/[0.06]">
          <CardRow
            label="Enable storefront"
            description="When enabled, customers can browse and order from your storefront."
          >
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => updateField("enabled", checked)}
            />
          </CardRow>
          {storefrontUrl && (
            <CardRow
              label="Storefront URL"
              description="Share this URL with customers."
            >
              <div className="flex items-center gap-2">
                <span className="max-w-[200px] truncate text-[11px] text-black/50 font-mono">
                  {storefrontUrl}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(storefrontUrl);
                    toast.success("URL copied to clipboard");
                  }}
                  className="rounded-md p-1.5 text-black/40 hover:bg-black/[0.04] hover:text-black/70 transition-colors"
                >
                  <Copy size={14} />
                </button>
                <a
                  href={storefrontUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md p-1.5 text-black/40 hover:bg-black/[0.04] hover:text-black/70 transition-colors"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </CardRow>
          )}
          {!handle && (
            <CardRow
              label="Storefront handle"
              description="Claim a handle in Settings to get a storefront URL."
            >
              <span className="text-[11px] text-black/30 italic">Not claimed</span>
            </CardRow>
          )}
        </div>
      </div>

      {/* Store info */}
      <div className="space-y-4">
        <SectionHeader
          title="Store Information"
          subtitle="Your store's identity — shown on the storefront."
        />
        <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white divide-y divide-black/[0.06]">
          <CardRow label="Store name" description="Displayed in the header and SEO tags.">
            <Input
              value={settings.storeName}
              onChange={(e) => updateField("storeName", e.target.value)}
              placeholder="My Store"
              className="h-8 w-48 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px]"
            />
          </CardRow>
          <CardRow label="Tagline" description="A short description shown below the store name.">
            <Input
              value={settings.tagline}
              onChange={(e) => updateField("tagline", e.target.value)}
              placeholder="Premium products"
              className="h-8 w-48 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px]"
            />
          </CardRow>
          <CardRow label="Logo" description="Displayed in the storefront header.">
            <div className="flex items-center gap-3">
              {settings.logoUrl && (
                <img
                  src={settings.logoUrl}
                  alt="Store logo"
                  className="h-8 w-8 rounded-md object-cover border border-black/[0.08]"
                />
              )}
              <label className="cursor-pointer rounded-lg bg-black/[0.06] px-3 py-1.5 text-[11px] font-semibold text-black/60 hover:bg-black/[0.1] transition-colors">
                {settings.logoUrl ? "Change" : "Upload"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={handleLogoUpload}
                />
              </label>
              {settings.logoUrl && (
                <button
                  type="button"
                  onClick={() => updateField("logoUrl", null)}
                  className="text-[11px] text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </div>
          </CardRow>
          <CardRow label="Contact phone" description="Shown in the storefront footer.">
            <Input
              value={settings.contactPhone || ""}
              onChange={(e) => updateField("contactPhone", e.target.value || null)}
              placeholder="01XXXXXXXXX"
              className="h-8 w-48 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px]"
            />
          </CardRow>
          <CardRow label="Contact email" description="Shown in the storefront footer.">
            <Input
              value={settings.contactEmail || ""}
              onChange={(e) => updateField("contactEmail", e.target.value || null)}
              placeholder="hello@store.com"
              className="h-8 w-48 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px]"
            />
          </CardRow>
        </div>
      </div>

      {/* Appearance */}
      <div className="space-y-4">
        <SectionHeader
          title="Appearance"
          subtitle="Customize the look and feel of your storefront."
        />
        <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white divide-y divide-black/[0.06]">
          <CardRow label="Primary color" description="Used for buttons, links, and accents.">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.primaryColor}
                onChange={(e) => updateField("primaryColor", e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-md border border-black/[0.1]"
              />
              <Input
                value={settings.primaryColor}
                onChange={(e) => updateField("primaryColor", e.target.value)}
                className="h-8 w-24 rounded-lg border-black/[0.1] bg-black/[0.04] font-mono text-[11px]"
              />
            </div>
          </CardRow>
          <CardRow label="Background color" description="Storefront page background.">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.backgroundColor}
                onChange={(e) => updateField("backgroundColor", e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-md border border-black/[0.1]"
              />
              <Input
                value={settings.backgroundColor}
                onChange={(e) => updateField("backgroundColor", e.target.value)}
                className="h-8 w-24 rounded-lg border-black/[0.1] bg-black/[0.04] font-mono text-[11px]"
              />
            </div>
          </CardRow>
        </div>
      </div>

      {/* Social links */}
      <div className="space-y-4">
        <SectionHeader
          title="Social Links"
          subtitle="Links displayed in the storefront footer."
        />
        <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white divide-y divide-black/[0.06]">
          <CardRow label="Facebook" description="Your Facebook page URL.">
            <Input
              value={settings.socialFacebook || ""}
              onChange={(e) => updateField("socialFacebook", e.target.value || null)}
              placeholder="https://facebook.com/yourstore"
              className="h-8 w-48 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px]"
            />
          </CardRow>
          <CardRow label="Instagram" description="Your Instagram profile URL.">
            <Input
              value={settings.socialInstagram || ""}
              onChange={(e) => updateField("socialInstagram", e.target.value || null)}
              placeholder="https://instagram.com/yourstore"
              className="h-8 w-48 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px]"
            />
          </CardRow>
          <CardRow label="TikTok" description="Your TikTok profile URL.">
            <Input
              value={settings.socialTiktok || ""}
              onChange={(e) => updateField("socialTiktok", e.target.value || null)}
              placeholder="https://tiktok.com/@yourstore"
              className="h-8 w-48 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px]"
            />
          </CardRow>
        </div>
      </div>

      {/* SEO defaults */}
      <div className="space-y-4">
        <SectionHeader
          title="SEO Defaults"
          subtitle="Templates for auto-generated meta tags."
        />
        <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white divide-y divide-black/[0.06]">
          <CardRow
            label="Title template"
            description="Use {product_name} and {store_name} as placeholders."
          >
            <Input
              value={settings.seoTitleTemplate}
              onChange={(e) => updateField("seoTitleTemplate", e.target.value)}
              className="h-8 w-56 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px] font-mono"
            />
          </CardRow>
          <CardRow
            label="Description template"
            description="Use {product_description} as placeholder."
          >
            <Input
              value={settings.seoDescriptionTemplate}
              onChange={(e) => updateField("seoDescriptionTemplate", e.target.value)}
              className="h-8 w-56 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px] font-mono"
            />
          </CardRow>
        </div>
      </div>

      {/* Shipping Zones */}
      <div className="space-y-4">
        <SectionHeader
          title="Shipping & Delivery"
          subtitle="Configure delivery rates by zone. Customers select their zone at checkout."
        />
        <div className="space-y-3">
          {zones.map((zone, index) => (
            <div
              key={zone.id}
              className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">
                  Zone {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeZone(index)}
                  className="rounded-md p-1 text-black/30 hover:bg-red-50 hover:text-red-500 transition-colors"
                  title="Remove zone"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-black/40 mb-1 block">Zone name</label>
                  <Input
                    value={zone.name}
                    onChange={(e) => updateZone(index, { name: e.target.value })}
                    placeholder="Inside Dhaka"
                    className="h-8 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-black/40 mb-1 block">Delivery charge (৳)</label>
                  <Input
                    type="number"
                    min={0}
                    value={zone.price}
                    onChange={(e) => updateZone(index, { price: parseFloat(e.target.value) || 0 })}
                    className="h-8 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-black/40 mb-1 block">Free shipping above (৳)</label>
                  <Input
                    type="number"
                    min={0}
                    value={zone.free_above}
                    onChange={(e) => updateZone(index, { free_above: parseFloat(e.target.value) || 0 })}
                    placeholder="0 = no free shipping"
                    className="h-8 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px]"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addZone}
            className="flex items-center gap-2 rounded-[14px] border border-dashed border-black/[0.12] bg-white px-4 py-3 text-[13px] font-medium text-black/50 hover:border-black/20 hover:text-black/70 transition-colors w-full justify-center"
          >
            <Plus size={14} />
            Add shipping zone
          </button>
        </div>
      </div>
    </div>
  );
}
