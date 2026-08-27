import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/ios-spinner";
import StoreChat from "@/components/StoreChat";
import IPhoneMockup from "@/components/ui/iphone-mockup";
import { ExternalLink } from "lucide-react";

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
  shippingZones: unknown[];
  customDomain: string | null;
};

const DEFAULTS: StorefrontSettings = {
  enabled: true,
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
  customDomain: null,
};

// ── Section header ───────────────────────────────────────────────────────────
function SectionHeader({
  title,
  subtitle,
  highlight,
}: {
  title: string;
  subtitle: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <h2 className="text-[17px] font-semibold text-black tracking-tight">
        {highlight ? (
          <span className="inline-block rounded-[4px] bg-yellow-300 px-1.5 uppercase">
            {title}
          </span>
        ) : (
          title
        )}
      </h2>
      <p className="mt-0.5 text-[13px] text-black/45">{subtitle}</p>
    </div>
  );
}

// ── Self-contained storefront preview ────────────────────────────────────────
const SAMPLE_PRODUCTS = [
  { name: "Classic Tote Bag", price: 1290 },
  { name: "Linen Shirt", price: 1890 },
  { name: "Leather Wallet", price: 990 },
  { name: "Canvas Sneakers", price: 2450 },
];

function StorefrontPreview({ settings }: { settings: StorefrontSettings }) {
  const accent = settings.primaryColor || "#000000";
  const bg = settings.backgroundColor || "#FAFAF8";
  const name = settings.storeName || "My Store";

  return (
    <div
      className="overflow-hidden rounded-[14px] border border-black/[0.08]"
      style={{ backgroundColor: bg, color: "#111" }}
    >
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {settings.logoUrl ? (
            <img
              src={settings.logoUrl}
              alt="logo"
              className="h-9 w-9 rounded-md object-cover border border-black/[0.08]"
            />
          ) : (
            <div
              className="h-9 w-9 rounded-md flex items-center justify-center text-white text-[13px] font-semibold"
              style={{ backgroundColor: accent }}
            >
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[15px] font-semibold truncate" style={{ color: accent }}>
              {name}
            </p>
            {settings.tagline && (
              <p className="text-[11px] text-black/45 truncate">{settings.tagline}</p>
            )}
          </div>
        </div>
        <button
          className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-white"
          style={{ backgroundColor: accent }}
        >
          Cart
        </button>
      </div>

      <div className="px-5 py-7 text-center">
        <h3 className="text-[20px] font-light tracking-tight" style={{ color: accent }}>
          {settings.tagline || "Welcome to " + name}
        </h3>
        <p className="mt-1 text-[12px] text-black/45">
          Browse our latest collection
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 pb-6">
        {SAMPLE_PRODUCTS.map((p) => (
          <div
            key={p.name}
            className="overflow-hidden rounded-xl border border-black/[0.06] bg-white"
          >
            <div
              className="h-24 w-full flex items-center justify-center text-black/15 text-[11px]"
              style={{ backgroundColor: "rgba(0,0,0,0.03)" }}
            >
              Product image
            </div>
            <div className="px-3 py-2">
              <p className="text-[12px] font-medium truncate">{p.name}</p>
              <p className="text-[12px] mt-0.5" style={{ color: accent }}>
                ৳{p.price.toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div
        className="px-5 py-4 text-center"
        style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
      >
        <div className="flex items-center justify-center gap-4 text-[11px] text-black/40">
          {settings.socialFacebook && <span>Facebook</span>}
          {settings.socialInstagram && <span>Instagram</span>}
          {settings.socialTiktok && <span>TikTok</span>}
        </div>
        {(settings.contactPhone || settings.contactEmail) && (
          <p className="mt-1 text-[10px] text-black/35">
            {[settings.contactPhone, settings.contactEmail].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function OnlineStore() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<StorefrontSettings>(DEFAULTS);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ── Load settings + preview url ────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, provisionRes] = await Promise.all([
        apiFetch("/api/storefront/settings"),
        apiFetch("/api/storefront/provision"),
      ]);
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        // Storefront is enabled automatically — always treat it as on.
        setSettings({ ...DEFAULTS, ...data.settings, enabled: true });
      }
      if (provisionRes.ok) {
        const data = await provisionRes.json();
        const url = data.url || null;
        setPreviewUrl(settings.customDomain ? `https://${settings.customDomain}` : url);
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

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-7rem)] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const livePreviewUrl = previewUrl || (import.meta.env.DEV ? "http://localhost:5001" : null);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-2">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* LEFT: AI chat */}
        <div className="lg:sticky lg:top-6 flex flex-col gap-4 h-[calc(100vh-7rem)]">
          <div className="text-center">
            <SectionHeader
              title="Store Assistant"
              subtitle="Ask about your storefront."
              highlight
            />
          </div>
          <div className="flex-1 min-h-0">
            <StoreChat />
          </div>
        </div>

        {/* RIGHT: mobile preview */}
        <div className="space-y-4">
          <div className="text-center">
            <SectionHeader
              title="Preview"
              subtitle="Mobile preview of your live storefront."
            />
          </div>
          <div className="flex justify-center">
            <div
              className="relative"
              style={{ width: 417 * 0.72, height: 876 * 0.72 }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  transform: "scale(0.72)",
                  transformOrigin: "top left",
                }}
              >
                <IPhoneMockup
                  model="15-pro"
                  color="black"
                  scale={1}
                  safeArea={true}
                  safeAreaOverrides={{ top: 52, bottom: 0 }}
                  showHomeIndicator={false}
                  screenBg="#ffffff"
                >
              {livePreviewUrl ? (
                <iframe
                  src={livePreviewUrl}
                  title="Storefront preview"
                  className="h-full w-full bg-white"
                  loading="lazy"
                />
              ) : (
                <StorefrontPreview settings={settings} />
              )}
            </IPhoneMockup>
          </div>
          </div>
          </div>
          {previewUrl && previewUrl !== livePreviewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-black/45 hover:text-black/70 transition-colors"
            >
              <ExternalLink size={12} />
              Open the live published storefront
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
