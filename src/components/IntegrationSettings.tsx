import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Eye, EyeOff, CheckCircle2, XCircle,
  ShoppingBag, Truck, Shield, Package, BarChart2, ChevronDown,
  MessageSquare, Camera, Phone, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

function SaveIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} color="currentColor" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
  fields: FieldDef[];
  testKey?: string;
};

const SECTIONS: SectionDef[] = [
  {
    id: "shopify",
    label: "Shopify",
    icon: ShoppingBag,
    description: "Sync orders from your store",
    fields: [
      { key: "shopify_store_url", label: "Store URL", placeholder: "yourstore.myshopify.com", hint: "Domain without https://" },
      { key: "shopify_admin_api_token", label: "Admin API Token", placeholder: "shpat_xxxxxxxxxxxxxxxxxxxxxxxx", secret: true, hint: "Shopify Admin → Apps → Develop apps → API credentials" },
    ],
  },
  {
    id: "facebook",
    label: "Facebook Ads",
    icon: BarChart2,
    description: "Track ad spend in P&L dashboard",
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
    icon: Truck,
    description: "Packzy delivery integration",
    fields: [
      { key: "steadfast_api_key", label: "API Key", placeholder: "Your Steadfast API key", secret: true },
      { key: "steadfast_secret_key", label: "Secret Key", placeholder: "Your Steadfast secret key", secret: true },
      { key: "courier_webhook_secret", label: "Webhook Secret", placeholder: "any-secret-string-you-choose", secret: true, hint: "Set this same value in Steadfast dashboard → Webhook settings as the secret header value" },
    ],
  },
  {
    id: "pathao",
    label: "Pathao Courier",
    icon: Package,
    description: "Pathao delivery integration",
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
    icon: Shield,
    description: "Customer fraud detection",
    fields: [
      { key: "fraudshield_api_key", label: "API Key", placeholder: "Your FraudShield API key", secret: true, hint: "From fraudshield.bd dashboard" },
    ],
    testKey: "fraudshield",
  },
  {
    id: "facebook-messenger",
    label: "Facebook Messenger",
    icon: MessageSquare,
    description: "AI bot for Facebook Messenger DMs",
    fields: [
      { key: "fb_page_access_token", label: "Page Access Token", placeholder: "EAAxxxxxxxxx", secret: true, hint: "Meta Business Suite → Your Page → Settings → Page Access Token (long-lived)" },
      { key: "fb_verify_token", label: "Webhook Verify Token", placeholder: "any-secret-string-you-choose", hint: `Set this in Meta App Dashboard → Webhooks. Webhook URL: https://dashboard.arclabtechnology.com/api/webhooks/facebook` },
      { key: "fb_app_secret", label: "App Secret", placeholder: "Your Meta App Secret", secret: true, hint: "Meta Developer Portal → Your App → Settings → Basic → App Secret. Used to verify incoming webhooks." },
    ],
  },
  {
    id: "instagram-dm",
    label: "Instagram DM",
    icon: Camera,
    description: "AI bot for Instagram Direct Messages",
    fields: [
      { key: "ig_page_access_token", label: "Page Access Token", placeholder: "EAAxxxxxxxxx", secret: true, hint: "Same Facebook Page token — Instagram is connected via Facebook. Subscribe 'messages' webhook under Instagram in Meta App Dashboard." },
      { key: "fb_verify_token", label: "Webhook Verify Token", placeholder: "same-as-facebook", hint: `Uses the same webhook as Facebook: https://dashboard.arclabtechnology.com/api/webhooks/facebook` },
    ],
  },
  {
    id: "whatsapp-business",
    label: "WhatsApp Business",
    icon: Phone,
    description: "AI bot for WhatsApp Business messages",
    fields: [
      { key: "wa_phone_number_id", label: "Phone Number ID", placeholder: "123456789012345", hint: "Meta Developer Console → WhatsApp → API Setup → Phone Number ID" },
      { key: "wa_access_token", label: "Access Token", placeholder: "EAAxxxxxxxxx", secret: true, hint: "Permanent system user token from Meta Business Suite" },
      { key: "wa_verify_token", label: "Webhook Verify Token", placeholder: "any-secret-string-you-choose", hint: `Webhook URL: https://dashboard.arclabtechnology.com/api/webhooks/whatsapp` },
    ],
  },
];

type Settings = Record<string, string>;

function FieldRow({ field, value, onChange }: { field: FieldDef; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="text-[8px] font-medium uppercase tracking-[0.2em] text-black">{field.label}</label>
      <div className="relative">
        <input
          type={field.secret && !show ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="w-full h-9 px-3 bg-[#FAFAF8] border border-black/[0.08] text-sm font-mono text-black placeholder:text-black placeholder:font-sans outline-none focus:border-black/20 transition-colors pr-9"
        />
        {field.secret && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-black hover:text-black transition-colors"
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {field.hint && <p className="text-[9px] text-black leading-relaxed">{field.hint}</p>}
    </div>
  );
}

function IntegrationRow({
  section,
  settings,
  onSave,
  isLast,
}: {
  section: SectionDef;
  settings: Settings;
  onSave: (patch: Settings) => Promise<void>;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Settings>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "success" | "error">("idle");
  const Icon = section.icon;

  useEffect(() => {
    const init: Settings = {};
    for (const f of section.fields) init[f.key] = settings[f.key] || "";
    setValues(init);
  }, [settings, section.fields]);

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
      if (section.testKey === "fraudshield") {
        const res = await apiFetch("/api/settings/test-fraudshield", { method: "POST" });
        const data = await res.json();
        if (!res.ok || data?.error) { setTestStatus("error"); toast.error("Failed to connect to FraudShield. Please check your API key."); }
        else { setTestStatus("success"); toast.success("FraudShield connected"); }
      } else if (section.testKey === "facebook") {
        const res = await apiFetch("/api/settings/test-facebook", { method: "POST" });
        const data = await res.json();
        if (!res.ok || data?.error) { setTestStatus("error"); toast.error("Failed to connect to Facebook Ads. Please check your credentials."); }
        else { setTestStatus("success"); toast.success("Facebook Ads connected"); }
      }
    } catch {
      setTestStatus("error");
      toast.error("Could not reach the API");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={cn(!isLast && "border-b border-black/[0.04]")}>
      {/* Row header — click to expand */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-8 py-4 hover:bg-black/[0.01] transition-colors text-left"
        data-testid={`button-expand-${section.id}`}
      >
        <div className="flex items-center gap-4">
          <div className={cn("h-6 w-6 flex items-center justify-center", isConfigured ? "bg-black" : "bg-black/[0.05]")}>
            <Icon className={cn("h-3 w-3", isConfigured ? "text-white" : "text-black")} />
          </div>
          <div>
            <p className="text-[8px] font-medium tracking-[0.25em] text-black uppercase">{section.label}</p>
            <p className="text-[9px] text-black mt-0.5">{section.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn(
            "text-[7px] font-bold tracking-[0.15em] uppercase px-2 py-1",
            isConfigured ? "bg-emerald-50 text-emerald-600" : "bg-black/[0.03] text-black"
          )}>
            {isConfigured ? "Configured" : "Not set"}
          </span>
          <ChevronDown className={cn("h-3 w-3 text-black transition-transform duration-200", open && "rotate-180")} />
        </div>
      </button>

      {/* Expanded fields */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="fields"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-8 pb-6 pt-2 bg-[#FAFAF8] border-t border-black/[0.04]">
              <div className="grid gap-4 sm:grid-cols-2 mt-4">
                {section.fields.map((f) => (
                  <FieldRow
                    key={f.key}
                    field={f}
                    value={values[f.key] || ""}
                    onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
                  />
                ))}
              </div>

              <div className="flex items-center gap-3 mt-5">
                <button
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className="flex items-center gap-1.5 h-8 px-4 bg-black text-white text-[9px] font-medium tracking-[0.2em] uppercase disabled:opacity-30 transition-opacity"
                  data-testid={`button-save-${section.id}`}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <SaveIcon className="h-3 w-3" />}
                  Save
                </button>

                {(section.testKey === "fraudshield" || section.testKey === "facebook") && (
                  <>
                    <button
                      onClick={handleTest}
                      disabled={testing || !isConfigured}
                      className="flex items-center gap-1.5 h-8 px-4 border border-black/[0.1] bg-white text-[9px] font-medium tracking-[0.2em] uppercase hover:bg-black/[0.02] disabled:opacity-30 transition-all"
                      data-testid={`button-test-${section.id}`}
                    >
                      {testing ? <Loader2 className="h-3 w-3 animate-spin" />
                        : testStatus === "success" ? <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        : testStatus === "error" ? <XCircle className="h-3 w-3 text-red-500" />
                        : <Shield className="h-3 w-3 text-black" />}
                      Test
                    </button>
                    {testStatus !== "idle" && (
                      <span className={cn("text-[9px] font-medium", testStatus === "success" ? "text-emerald-600" : "text-red-500")}>
                        {testStatus === "success" ? "Connected" : "Failed"}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BrandDocSection() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
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
      toast.success("Brand document saved — AI bot updated");
    } catch {
      toast.error("Failed to save brand document");
    } finally {
      setSaving(false);
    }
  };

  const hasContent = content.trim().length > 0;

  return (
    <div className="border border-black/[0.07] bg-white mt-4">
      <div className="flex items-center justify-between px-8 py-3 border-b border-black/[0.05]">
        <div className="flex items-center gap-2.5">
          <FileText className="h-3 w-3 text-black" />
          <span className="text-[8px] font-medium tracking-[0.3em] text-black uppercase">Brand Document</span>
        </div>
        <span className="text-[8px] font-medium tracking-[0.15em] uppercase px-2 py-1 bg-black/[0.03] text-black">
          AI Knowledge Base
        </span>
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-8 py-4 hover:bg-black/[0.01] transition-colors text-left"
        data-testid="button-expand-brand-doc"
      >
        <div className="flex items-center gap-4">
          <div className={cn("h-6 w-6 flex items-center justify-center", hasContent ? "bg-black" : "bg-black/[0.05]")}>
            <FileText className={cn("h-3 w-3", hasContent ? "text-white" : "text-black")} />
          </div>
          <div>
            <p className="text-[8px] font-medium tracking-[0.25em] text-black uppercase">Brand Knowledge Doc</p>
            <p className="text-[9px] text-black mt-0.5">Paste your brand guide, FAQs, product policies — the AI will use this to answer customers</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("text-[7px] font-bold tracking-[0.15em] uppercase px-2 py-1", hasContent ? "bg-emerald-50 text-emerald-600" : "bg-black/[0.03] text-black")}>
            {hasContent ? `${content.trim().split(/\s+/).length} words` : "Not set"}
          </span>
          <ChevronDown className={cn("h-3 w-3 text-black transition-transform duration-200", open && "rotate-180")} />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="brand-doc"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-8 pb-6 pt-2 bg-[#FAFAF8] border-t border-black/[0.04]">
              {loading ? (
                <div className="h-36 bg-black/[0.03] animate-pulse mt-4" />
              ) : (
                <>
                  <textarea
                    value={content}
                    onChange={(e) => { setContent(e.target.value); setSaved(false); }}
                    placeholder="Paste your brand guide, FAQs, product descriptions, shipping policies, return policies, brand tone of voice…&#10;&#10;The AI will use this to answer customer questions on Facebook, Instagram, and WhatsApp."
                    className="w-full h-48 mt-4 px-3 py-2.5 bg-white border border-black/[0.08] text-[11px] text-black placeholder:text-black outline-none focus:border-black/20 transition-colors resize-y leading-relaxed font-mono"
                    data-testid="textarea-brand-doc"
                  />
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 h-8 px-4 bg-black text-white text-[9px] font-medium tracking-[0.2em] uppercase disabled:opacity-30 transition-opacity"
                      data-testid="button-save-brand-doc"
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <SaveIcon className="h-3 w-3" />}
                      Save
                    </button>
                    {saved && (
                      <span className="flex items-center gap-1.5 text-[9px] text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />
                        Saved
                      </span>
                    )}
                    {content.trim() && (
                      <span className="text-[9px] text-black ml-auto">{content.trim().split(/\s+/).length} words · {content.length} chars</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function IntegrationSettings() {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);

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

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="border border-black/[0.07] bg-white"
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-8 py-3 border-b border-black/[0.05]">
          <div className="flex items-center gap-2.5">
            <BarChart2 className="h-3 w-3 text-black" />
            <span className="text-[8px] font-medium tracking-[0.3em] text-black uppercase">Integrations</span>
          </div>
          <span className="text-[8px] font-medium tracking-[0.2em] text-black uppercase">
            {SECTIONS.filter((s) => s.fields.every((f) => !!(settings[f.key] || "").trim())).length}/{SECTIONS.length} configured
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-4 w-4 animate-spin text-black" />
          </div>
        ) : (
          SECTIONS.map((section, i) => (
            <IntegrationRow
              key={section.id}
              section={section}
              settings={settings}
              onSave={handleSave}
              isLast={i === SECTIONS.length - 1}
            />
          ))
        )}
      </motion.div>
      <BrandDocSection />
    </>
  );
}
