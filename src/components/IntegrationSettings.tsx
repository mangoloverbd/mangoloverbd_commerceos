import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye, EyeOff, CheckCircle2, XCircle,
  ShieldCheck, FileHeart, ChevronRight, ArrowLeft, Link2, Unplug, Bot, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import SteadfastLogo from "@/components/SteadfastLogo";
import PathaoLogo from "@/components/PathaoLogo";

// ── Brand icons ──────────────────────────────────────────────────────────────

function ShopifyIcon({ className }: { className?: string }) {
  return (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className} fill="currentColor">
      <path d="M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023zM11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715-.02.01zM11.17.83c.136 0 .271.038.405.135-.984.465-2.064 1.639-2.508 3.992-.656.213-1.293.405-1.889.578C7.697 3.75 8.951.84 11.17.84V.83zm1.235 2.949v.135c-.754.232-1.583.484-2.394.736.466-1.777 1.333-2.645 2.085-2.971.193.501.309 1.176.309 2.1zm.539-2.234c.694.074 1.141.867 1.429 1.755-.349.114-.735.231-1.158.366v-.252c0-.752-.096-1.371-.271-1.871v.002zm2.992 1.289c-.02 0-.06.021-.078.021s-.289.075-.714.21c-.423-1.233-1.176-2.37-2.508-2.37h-.115C12.135.209 11.669 0 11.265 0 8.159 0 6.675 3.877 6.21 5.846c-1.194.365-2.063.636-2.16.674-.675.213-.694.232-.772.87-.075.462-1.83 14.063-1.83 14.063L15.009 24l.927-21.166z"/>
    </svg>
  );
}

function MetaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

function MessengerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.373 0 0 4.975 0 11.111c0 3.497 1.745 6.616 4.472 8.652V24l4.086-2.242c1.09.301 2.246.464 3.442.464 6.627 0 12-4.975 12-11.111C24 4.975 18.627 0 12 0zm1.193 14.963l-3.056-3.259-5.963 3.259 6.559-6.963 3.13 3.259 5.889-3.259-6.559 6.963z"/>
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
    </svg>
  );
}

function FraudShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 14l-3-3 1.41-1.41L11 12.17l4.59-4.58L17 9l-6 6z"/>
    </svg>
  );
}

// Steadfast & Pathao use image logos rendered on coloured backgrounds
function SteadfastIcon({ className }: { className?: string }) {
  return <SteadfastLogo className={className} />;
}

function PathaoIcon({ className }: { className?: string }) {
  return <PathaoLogo className={className} />;
}

function SaveIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17.9808V12.7075C3 9.07416 3 7.25748 4.09835 6.12874C5.1967 5 6.96447 5 10.5 5C14.0355 5 15.8033 5 16.9017 6.12874C18 7.25748 18 9.07416 18 12.7075V17.9808C18 20.2867 18 21.4396 17.2755 21.8523C15.8724 22.6514 13.2405 19.9852 11.9906 19.1824C11.2657 18.7168 10.9033 18.484 10.5 18.484C10.0967 18.484 9.73425 18.7168 9.00938 19.1824C7.7595 19.9852 5.12763 22.6514 3.72454 21.8523C3 21.4396 3 20.2867 3 17.9808Z" />
      <path d="M9 2H11C15.714 2 18.0711 2 19.5355 3.46447C21 4.92893 21 7.28595 21 12V18" />
    </svg>
  );
}

type FieldDef = {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
  hint?: string;
};

type SectionDef = {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  color: string;
  logoMode?: "wordmark"; // renders icon on white bg, full size
  fields: FieldDef[];
  testKey?: string;
};

const SECTIONS: SectionDef[] = [
  {
    id: "shopify",
    label: "Shopify",
    icon: ShopifyIcon,
    description: "Sync orders from your store",
    color: "bg-[#96BF48]",
    fields: [
      { key: "shopify_store_url", label: "Store URL", placeholder: "yourstore.myshopify.com", hint: "Domain without https://" },
      { key: "shopify_admin_api_token", label: "Admin API Token", placeholder: "shpat_xxxxxxxxxxxxxxxxxxxxxxxx", secret: true, hint: "Shopify Admin → Apps → Develop apps → API credentials" },
    ],
  },
  {
    id: "facebook",
    label: "Facebook Ads",
    icon: MetaIcon,
    description: "Track ad spend in P&L dashboard",
    color: "bg-[#0866FF]",
    fields: [
      { key: "facebook_access_token", label: "Access Token", placeholder: "EAAxxxxxxxxxxxxxxx", secret: true, hint: "Long-lived token from Meta Business Suite → System Users" },
      { key: "facebook_ad_account_id", label: "Ad Account ID", placeholder: "act_123456789", hint: "From Ads Manager URL or Business Settings → Ad Accounts" },
      { key: "usd_to_bdt_rate", label: "USD → BDT Rate", placeholder: "110", hint: "Converts Facebook USD spend to BDT" },
    ],
    testKey: "facebook",
  },
  {
    id: "steadfast",
    label: "Steadfast Courier",
    icon: SteadfastIcon,
    description: "Packzy delivery integration",
    color: "bg-transparent",
    logoMode: "wordmark",
    fields: [
      { key: "steadfast_api_key", label: "API Key", placeholder: "Your Steadfast API key", secret: true },
      { key: "steadfast_secret_key", label: "Secret Key", placeholder: "Your Steadfast secret key", secret: true },
      { key: "courier_webhook_secret", label: "Webhook Secret", placeholder: "any-secret-string-you-choose", secret: true, hint: "Set this same value in Steadfast dashboard → Webhook settings" },
    ],
  },
  {
    id: "pathao",
    label: "Pathao Courier",
    icon: PathaoIcon,
    description: "Pathao delivery integration",
    color: "bg-transparent",
    logoMode: "wordmark",
    fields: [
      { key: "pathao_client_id", label: "Client ID", placeholder: "Your Pathao client ID" },
      { key: "pathao_client_secret", label: "Client Secret", placeholder: "Your Pathao client secret", secret: true },
      { key: "pathao_username", label: "Email", placeholder: "your@email.com" },
      { key: "pathao_password", label: "Password", placeholder: "Your Pathao account password", secret: true },
      { key: "pathao_store_id", label: "Store ID", placeholder: "12345", hint: "Numeric ID from Pathao dashboard" },
    ],
  },
  {
    id: "fraudshield",
    label: "FraudShield",
    icon: FraudShieldIcon,
    description: "Customer fraud detection",
    color: "bg-[#16A34A]",
    fields: [
      { key: "fraudshield_api_key", label: "API Key", placeholder: "Your FraudShield API key", secret: true, hint: "From fraudshield.bd dashboard" },
    ],
    testKey: "fraudshield",
  },
  {
    id: "facebook-messenger",
    label: "Facebook Messenger",
    icon: MessengerIcon,
    description: "AI bot for Facebook Messenger DMs",
    color: "bg-[#0866FF]",
    fields: [
      { key: "fb_page_access_token", label: "Page Access Token", placeholder: "EAAxxxxxxxxx", secret: true, hint: "Meta Business Suite → Your Page → Settings → Page Access Token" },
      { key: "fb_verify_token", label: "Webhook Verify Token", placeholder: "any-secret-string-you-choose", hint: `Webhook URL: https://suite.arclabtechnology.com/api/webhooks/facebook` },
      { key: "fb_app_secret", label: "App Secret", placeholder: "Your Meta App Secret", secret: true, hint: "Meta Developer Portal → Your App → Settings → Basic → App Secret" },
    ],
  },
  {
    id: "instagram-dm",
    label: "Instagram DM",
    icon: InstagramIcon,
    description: "AI bot for Instagram Direct Messages",
    color: "bg-gradient-to-br from-[#f9ce34] via-[#ee2a7b] to-[#6228d7]",
    fields: [
      { key: "ig_page_access_token", label: "Page Access Token", placeholder: "EAAxxxxxxxxx", secret: true, hint: "Same Facebook Page token — Instagram is connected via Facebook." },
      { key: "fb_verify_token", label: "Webhook Verify Token", placeholder: "same-as-facebook", hint: `Uses the same webhook as Facebook: https://suite.arclabtechnology.com/api/webhooks/facebook` },
    ],
  },
  {
    id: "whatsapp-business",
    label: "WhatsApp Business",
    icon: WhatsAppIcon,
    description: "AI bot for WhatsApp Business messages",
    color: "bg-[#25D366]",
    fields: [
      { key: "wa_phone_number_id", label: "Phone Number ID", placeholder: "123456789012345", hint: "Meta Developer Console → WhatsApp → API Setup → Phone Number ID" },
      { key: "wa_access_token", label: "Access Token", placeholder: "EAAxxxxxxxxx", secret: true, hint: "Permanent system user token from Meta Business Suite" },
      { key: "wa_verify_token", label: "Webhook Verify Token", placeholder: "any-secret-string-you-choose", hint: `Webhook URL: https://suite.arclabtechnology.com/api/webhooks/whatsapp` },
    ],
  },
];

type Settings = Record<string, string>;

type MetaStatus = {
  connected: boolean;
  pages: Array<{ id: string; page_id: string; page_name: string; webhook_subscribed: boolean; status: string }>;
  instagramAccounts: Array<{ id: string; instagram_account_id: string; username: string; account_name: string; status: string }>;
  whatsappAccounts: Array<{ id: string; whatsapp_business_account_id: string; phone_number_id: string | null; display_phone_number: string; account_name: string; status: string }>;
  adAccounts: Array<{ id: string; ad_account_id: string; account_name: string; currency: string | null; status: string }>;
  aiAutomation: { enabled: boolean; channels: string[]; handoffRules: Record<string, unknown> };
  whatsappConfigReady: boolean;
};

const GROUPS = [
  { label: "Commerce", ids: ["shopify"] },
  { label: "Marketing", ids: ["facebook"] },
  { label: "Courier", ids: ["steadfast", "pathao"] },
  { label: "Security", ids: ["fraudshield"] },
  { label: "Social", ids: ["facebook-messenger", "instagram-dm", "whatsapp-business"] },
];

function MetaAssetSection({
  title,
  count,
  expanded,
  onToggle,
  children,
  empty,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  empty: string;
}) {
  return (
    <div className="overflow-hidden border-b border-black/[0.06] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.025]"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-black">{title}</p>
          <p className="text-[11px] text-black/38">{count ? `${count} connected` : empty}</p>
        </div>
        <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium text-black/45">{count}</span>
        <ChevronDown className={cn("h-4 w-4 text-black/35 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div className="space-y-1.5 bg-black/[0.015] px-4 pb-4">
          {count ? children : <p className="rounded-[10px] bg-white px-3 py-2 text-[11px] leading-relaxed text-black/35">{empty}</p>}
        </div>
      )}
    </div>
  );
}

function MetaBusinessPanel() {
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    pages: true,
    instagram: false,
    whatsapp: false,
    ads: false,
  });
  const [assetBusy, setAssetBusy] = useState<string | null>(null);
  const [aiSaving, setAiSaving] = useState(false);
  const [resubscribing, setResubscribing] = useState(false);

  const refresh = () => {
    setLoading(true);
    apiFetch("/api/meta/status")
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() => toast.error("Failed to load Meta Business status"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    const params = new URLSearchParams(window.location.search);
    if (params.get("meta") === "connected") toast.success("Meta Business connected");
    if (params.get("meta") === "error") toast.error(params.get("message") || "Meta connection failed");
  }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const res = await apiFetch("/api/meta/oauth/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start Meta OAuth");
      window.location.href = data.url;
    } catch (err: any) {
      toast.error(err?.message || "Failed to start Meta OAuth");
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Meta Business? Historical inbox messages will be preserved.")) return;
    setDisconnecting(true);
    try {
      const res = await apiFetch("/api/meta/disconnect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to disconnect Meta");
      toast.success("Meta Business disconnected");
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to disconnect Meta");
    } finally {
      setDisconnecting(false);
    }
  };

  const disconnectAsset = async (type: "page" | "instagram" | "whatsapp" | "ad", id: string, label: string) => {
    if (!window.confirm(`Disconnect ${label}? Historical inbox messages will be preserved.`)) return;
    const busyKey = `${type}:${id}`;
    setAssetBusy(busyKey);
    try {
      const res = await apiFetch(`/api/meta/assets/${type}/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to disconnect asset");
      toast.success(`${label} disconnected`);
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to disconnect asset");
    } finally {
      setAssetBusy(null);
    }
  };

  const toggle = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // AI automation patch helpers
  const patchAI = async (body: { enabled?: boolean; channels?: string[] }) => {
    if (!status) return;
    setAiSaving(true);
    try {
      const res = await apiFetch("/api/meta/ai-automation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to update");
      // Optimistically update local state
      setStatus((prev) => {
        if (!prev) return prev;
        const updated = { ...prev.aiAutomation };
        if (body.enabled !== undefined) updated.enabled = body.enabled!;
        if (body.channels !== undefined) updated.channels = body.channels!;
        return { ...prev, aiAutomation: updated };
      });
      toast.success("AI automation updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update");
    } finally {
      setAiSaving(false);
    }
  };

  const toggleChannel = (ch: string) => {
    if (!status) return;
    const current = status.aiAutomation.channels;
    const next = current.includes(ch)
      ? current.filter((c) => c !== ch)
      : [...current, ch];
    patchAI({ channels: next });
  };

  const resubscribeWhatsApp = async () => {
    setResubscribing(true);
    try {
      const res = await apiFetch("/api/meta/resubscribe-whatsapp", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(data.message || "WhatsApp webhook subscriptions refreshed");
    } catch (err: any) {
      toast.error(err?.message || "Failed to resubscribe WhatsApp");
    } finally {
      setResubscribing(false);
    }
  };

  const row = (key: string, name: string, meta: string | undefined, onDisconnect: () => void, busy: boolean) => (
    <div key={key} className="flex items-center justify-between gap-3 rounded-[9px] bg-white px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-black">{name || key}</p>
        {meta && <p className="truncate text-[10px] text-black/35">{meta}</p>}
      </div>
      <button
        type="button"
        onClick={onDisconnect}
        disabled={busy}
        className="ml-1 flex h-7 shrink-0 items-center gap-1 rounded-[8px] border border-red-500/10 bg-red-50 px-2 text-[10px] font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
      >
        {busy ? <Spinner size="sm" /> : <Unplug className="h-3 w-3" />}
        Disconnect
      </button>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white">
      <div className="flex items-start gap-3 border-b border-black/[0.06] px-4 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#0866FF]">
          <MetaIcon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold text-black">Meta Business</p>
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              status?.connected ? "bg-emerald-100 text-emerald-700" : "bg-black/[0.06] text-black/45"
            )}>
              {status?.connected ? "Connected" : "Primary"}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-black/42">
            OAuth connection for Messenger, Instagram DM, WhatsApp Cloud API, ad accounts, webhooks, and AI automation.
          </p>
        </div>
        {loading ? (
          <Spinner size="sm" className="text-black/30" />
        ) : status?.connected ? (
          <button
            onClick={disconnect}
            disabled={disconnecting}
            className="flex h-9 items-center gap-1.5 rounded-[10px] border border-red-500/15 bg-red-50 px-3 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
          >
            {disconnecting ? <Spinner size="sm" /> : <Unplug className="h-3.5 w-3.5" />}
            Disconnect
          </button>
        ) : (
          <button
            onClick={connect}
            disabled={connecting}
            className="flex h-9 items-center gap-1.5 rounded-[10px] bg-black px-3 text-[12px] font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-50"
            data-testid="button-connect-meta-business"
          >
            {connecting ? <Spinner size="sm" /> : <Link2 className="h-3.5 w-3.5" />}
            Connect Meta Business
          </button>
        )}
      </div>

      {status?.connected && (
        <div>
          <MetaAssetSection
            title="Connected Facebook Pages"
            count={status.pages.length}
            expanded={expanded.pages}
            onToggle={() => toggle("pages")}
            empty="No Pages selected yet."
          >
            {status.pages.map((p) => row(
              p.id,
              p.page_name,
              `${p.page_id}${p.webhook_subscribed ? " · webhooks active" : " · webhooks not active"}`,
              () => disconnectAsset("page", p.id, p.page_name || "Facebook Page"),
              assetBusy === `page:${p.id}`
            ))}
          </MetaAssetSection>
          <MetaAssetSection
            title="Connected Instagram Accounts"
            count={status.instagramAccounts.length}
            expanded={expanded.instagram}
            onToggle={() => toggle("instagram")}
            empty="No Instagram Business accounts found."
          >
            {status.instagramAccounts.map((a) => row(
              a.id,
              a.account_name || a.username,
              a.username ? `@${a.username}` : a.instagram_account_id,
              () => disconnectAsset("instagram", a.id, a.account_name || a.username || "Instagram Account"),
              assetBusy === `instagram:${a.id}`
            ))}
          </MetaAssetSection>
          <MetaAssetSection
            title="Connected WhatsApp Accounts"
            count={status.whatsappAccounts.length}
            expanded={expanded.whatsapp}
            onToggle={() => toggle("whatsapp")}
            empty={status.whatsappConfigReady ? "No WhatsApp assets found." : "Backend is ready. Add META_WHATSAPP_CONFIG_ID to enable Embedded Signup launcher later."}
          >
            {status.whatsappAccounts.map((a) => row(
              a.id,
              a.account_name || a.display_phone_number,
              a.display_phone_number || a.whatsapp_business_account_id,
              () => disconnectAsset("whatsapp", a.id, a.account_name || a.display_phone_number || "WhatsApp Account"),
              assetBusy === `whatsapp:${a.id}`
            ))}
            {status.whatsappAccounts.length > 0 && (
              <div className="mt-2 px-1">
                <button
                  onClick={resubscribeWhatsApp}
                  disabled={resubscribing}
                  className="flex items-center gap-1.5 rounded-[8px] border border-black/[0.08] bg-white px-3 py-1.5 text-[11px] font-medium text-black/60 transition-colors hover:bg-black/[0.04] hover:text-black disabled:opacity-40"
                >
                  {resubscribing ? <Spinner size="sm" /> : <CheckCircle2 className="h-3 w-3" />}
                  Fix webhook subscription
                </button>
                <p className="mt-1 text-[10px] text-black/30">
                  Run this once if WhatsApp messages aren't appearing in the inbox.
                </p>
              </div>
            )}
          </MetaAssetSection>
          <MetaAssetSection
            title="Connected Ad Accounts"
            count={status.adAccounts.length}
            expanded={expanded.ads}
            onToggle={() => toggle("ads")}
            empty="No ad accounts found."
          >
            {status.adAccounts.map((a) => row(
              a.id,
              a.account_name,
              [a.ad_account_id, a.currency].filter(Boolean).join(" · "),
              () => disconnectAsset("ad", a.id, a.account_name || "Ad Account"),
              assetBusy === `ad:${a.id}`
            ))}
          </MetaAssetSection>
          <div className="m-4 rounded-[12px] border border-black/[0.07] bg-black/[0.015] px-3 py-3 space-y-3">
            {/* Header + master on/off toggle */}
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-black/45" />
              <p className="text-[12px] font-semibold text-black">AI Auto-Reply</p>
              {aiSaving && <Spinner size="sm" className="ml-1" />}
              {/* Master toggle */}
              <button
                onClick={() => patchAI({ enabled: !status.aiAutomation.enabled })}
                disabled={aiSaving}
                className={cn(
                  "ml-auto relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50",
                  status.aiAutomation.enabled ? "bg-emerald-500" : "bg-black/20"
                )}
              >
                <span className={cn(
                  "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                  status.aiAutomation.enabled ? "translate-x-4" : "translate-x-0.5"
                )} />
              </button>
            </div>

            {/* Per-channel toggles */}
            <div className="space-y-1.5">
              {(["facebook", "instagram", "whatsapp"] as const).map((ch) => {
                const labels: Record<string, string> = {
                  facebook: "Facebook Messenger",
                  instagram: "Instagram DM",
                  whatsapp: "WhatsApp Business",
                };
                const active = status.aiAutomation.channels.includes(ch);
                return (
                  <div key={ch} className="flex items-center justify-between rounded-[8px] bg-white px-2.5 py-1.5">
                    <span className="text-[11px] font-medium text-black/70">{labels[ch]}</span>
                    <button
                      onClick={() => toggleChannel(ch)}
                      disabled={aiSaving || !status.aiAutomation.enabled}
                      className={cn(
                        "relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-40",
                        active && status.aiAutomation.enabled ? "bg-emerald-500" : "bg-black/20"
                      )}
                    >
                      <span className={cn(
                        "inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow transition-transform",
                        active && status.aiAutomation.enabled ? "translate-x-3.5" : "translate-x-0.5"
                      )} />
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] leading-relaxed text-black/35">
              Replies use your Products catalog for variant availability and pricing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldRow({ field, value, onChange }: { field: FieldDef; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-medium text-black/50">{field.label}</label>
      <div className="relative">
        <input
          type={field.secret && !show ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="h-10 w-full rounded-[10px] border border-black/[0.08] bg-black/[0.03] px-3 pr-9 font-mono text-[13px] text-black outline-none transition-colors placeholder:font-sans placeholder:text-black/25 focus:border-black/20 focus:ring-1 focus:ring-black/10"
        />
        {field.secret && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-black/30 transition-colors hover:text-black/60"
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {field.hint && <p className="text-[11px] leading-relaxed text-black/35">{field.hint}</p>}
    </div>
  );
}

function DetailView({
  section,
  settings,
  onSave,
  onBack,
}: {
  section: SectionDef;
  settings: Settings;
  onSave: (patch: Settings) => Promise<void>;
  onBack: () => void;
}) {
  const [values, setValues] = useState<Settings>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "success" | "error">("idle");
  const Icon = section.icon;

  useEffect(() => {
    const init: Settings = {};
    for (const f of section.fields) init[f.key] = settings[f.key] || "";
    setValues(init);
    setTestStatus("idle");
  }, [settings, section]);

  const isDirty = section.fields.some((f) => values[f.key] !== (settings[f.key] || ""));
  const isConfigured = section.fields.every((f) => !!(settings[f.key] || "").trim());

  const handleSave = async () => {
    setSaving(true);
    setTestStatus("idle");
    try {
      await onSave(values);
      toast.success(`${section.label} saved`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestStatus("idle");
    try {
      const endpoint = section.testKey === "fraudshield"
        ? "/api/settings/test-fraudshield"
        : "/api/settings/test-facebook";
      const res = await apiFetch(endpoint, { method: "POST" });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setTestStatus("error");
        toast.error(`Failed to connect to ${section.label}.`);
      } else {
        setTestStatus("success");
        toast.success(`${section.label} connected`);
      }
    } catch {
      setTestStatus("error");
      toast.error("Could not reach the API");
    } finally {
      setTesting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16 }}
      className="space-y-6"
    >
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-[13px] font-medium text-black/40 hover:text-black transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Integrations
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className={cn(
          "shrink-0 flex items-center justify-center rounded-[10px] overflow-hidden",
          section.logoMode === "wordmark" ? "h-10 w-10 bg-white border border-black/[0.08] p-1.5" : "h-10 w-10",
          section.color
        )}>
          {section.logoMode === "wordmark"
            ? <Icon className="w-full h-full object-contain" />
            : <Icon className="h-5 w-5 text-white" strokeWidth={1.8} />}
        </div>
        <div>
          <h2 className="text-[17px] font-semibold text-black tracking-tight">{section.label}</h2>
          <p className="text-[12px] text-black/40">{section.description}</p>
        </div>
        <span className={cn(
          "ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium",
          isConfigured ? "bg-emerald-100 text-emerald-700" : "bg-black/[0.06] text-black/40"
        )}>
          {isConfigured ? "Configured" : "Not configured"}
        </span>
      </div>

      {/* Fields grouped in Apple list style */}
      <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white divide-y divide-black/[0.06]">
        {section.fields.map((f) => (
          <div key={f.key} className="px-5 py-4">
            <FieldRow
              field={f}
              value={values[f.key] || ""}
              onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
            />
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="flex h-9 items-center gap-1.5 rounded-[10px] bg-black px-4 text-[13px] font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-30"
          data-testid={`button-save-${section.id}`}
        >
          {saving ? <Spinner size="sm" /> : <SaveIcon className="h-3.5 w-3.5" />}
          Save
        </button>

        {section.testKey && (
          <button
            onClick={handleTest}
            disabled={testing || !isConfigured}
            className="flex h-9 items-center gap-1.5 rounded-[10px] border border-black/[0.08] bg-white px-4 text-[13px] font-medium text-black transition-colors hover:bg-black/[0.04] disabled:opacity-30"
            data-testid={`button-test-${section.id}`}
          >
            {testing ? <Spinner size="sm" />
              : testStatus === "success" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              : testStatus === "error"   ? <XCircle className="h-3.5 w-3.5 text-red-500" />
              : <ShieldCheck className="h-3.5 w-3.5 text-black/40" />}
            Test connection
          </button>
        )}

        {testStatus !== "idle" && (
          <span className={cn("text-[12px] font-medium", testStatus === "success" ? "text-emerald-600" : "text-red-500")}>
            {testStatus === "success" ? "Connected" : "Failed"}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function BrandDocPanel() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch("/api/social/brand-doc")
      .then((r) => r.json())
      .then((d) => setContent(d.content || ""))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch("/api/social/brand-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      setSaved(true);
      toast.success("Brand document saved");
    } catch {
      toast.error("Failed to save brand document");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-rose-500">
            <FileHeart className="h-4 w-4 text-white" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-black">Brand Document</p>
            <p className="text-[11px] text-black/40">AI knowledge base for social bot responses.</p>
          </div>
        </div>
        {content.trim() && (
          <span className="text-[11px] text-black/30">{content.trim().split(/\s+/).length} words</span>
        )}
      </div>

      {loading ? (
        <div className="h-36 animate-pulse rounded-[10px] bg-black/[0.04]" />
      ) : (
        <textarea
          value={content}
          onChange={(e) => { setContent(e.target.value); setSaved(false); }}
          placeholder={"Paste your brand guide, FAQs, product descriptions, shipping policies…\n\nThe AI uses this to answer customer questions on Facebook, Instagram, and WhatsApp."}
          className="h-44 w-full resize-y rounded-[10px] border border-black/[0.08] bg-black/[0.03] px-4 py-3 font-mono text-[13px] leading-relaxed text-black outline-none transition-colors placeholder:font-sans placeholder:text-black/25 focus:border-black/20 focus:ring-1 focus:ring-black/10"
          data-testid="textarea-brand-doc"
        />
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex h-9 items-center gap-1.5 rounded-[10px] bg-black px-4 text-[13px] font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-30"
          data-testid="button-save-brand-doc"
        >
          {saving ? <Spinner size="sm" /> : <SaveIcon className="h-3.5 w-3.5" />}
          Save
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}

function ListRow({
  section,
  settings,
  isLast,
  onClick,
}: {
  section: SectionDef;
  settings: Settings;
  isLast: boolean;
  onClick: () => void;
}) {
  const Icon = section.icon;
  const isConfigured = section.fields.every((f) => !!(settings[f.key] || "").trim());

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.03]",
        !isLast && "border-b border-black/[0.06]"
      )}
      data-testid={`button-select-${section.id}`}
    >
      <div className={cn(
        "shrink-0 flex items-center justify-center rounded-[8px] overflow-hidden",
        section.logoMode === "wordmark" ? "h-8 w-8 bg-white border border-black/[0.08] p-1" : "h-8 w-8",
        section.color
      )}>
        {section.logoMode === "wordmark"
          ? <Icon className="w-full h-full object-contain" />
          : <Icon className="h-4 w-4 text-white" strokeWidth={1.8} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-black truncate">{section.label}</p>
        <p className="text-[11px] text-black/40 truncate">{section.description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isConfigured && (
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
        )}
        <ChevronRight className="h-3.5 w-3.5 text-black/25" strokeWidth={2} />
      </div>
    </button>
  );
}

export function IntegrationSettings() {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SectionDef | null>(null);

  useEffect(() => {
    apiFetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (patch: Settings) => {
    const res = await apiFetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: patch }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed");
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="h-5 w-5 text-black/30" />
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {selected ? (
        <DetailView
          key={selected.id}
          section={selected}
          settings={settings}
          onSave={handleSave}
          onBack={() => setSelected(null)}
        />
      ) : (
        <motion.div
          key="list"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
          className="space-y-8"
        >
          <div>
            <h2 className="text-[17px] font-semibold text-black tracking-tight">Integrations</h2>
            <p className="mt-0.5 text-[13px] text-black/45">
              Connect the tools that power your commerce workflow.
              {" "}
              <span className="text-black/30">
                {SECTIONS.filter((s) => s.fields.every((f) => !!(settings[f.key] || "").trim())).length}/{SECTIONS.length} configured
              </span>
            </p>
          </div>

          {/* Primary Meta Business OAuth integration */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/30 px-1">Primary Social Platform</p>
            <MetaBusinessPanel />
          </div>

          {/* Grouped integration lists */}
          <div className="space-y-6">
            {GROUPS.map((group) => {
              const sections = SECTIONS.filter((s) => group.ids.includes(s.id));
              return (
                <div key={group.label}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/30 px-1">{group.label}</p>
                  <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white">
                    {sections.map((section, i) => (
                      <ListRow
                        key={section.id}
                        section={section}
                        settings={settings}
                        isLast={i === sections.length - 1}
                        onClick={() => setSelected(section)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Brand doc */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/30 px-1">AI</p>
            <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white px-4 py-4">
              <BrandDocPanel />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
