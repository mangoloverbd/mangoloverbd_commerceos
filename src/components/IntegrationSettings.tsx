import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye, EyeOff, CheckCircle2, XCircle,
  Store, Truck, ShieldCheck, PackageCheck, ChartNoAxesCombined, ChevronDown,
  MessagesSquare, Camera, PhoneCall, FileHeart, Search, ArrowLeftRight, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import { AnimatedText } from "@/components/ui/animated-text";

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
    icon: Store,
    description: "Sync orders from your store",
    fields: [
      { key: "shopify_store_url", label: "Store URL", placeholder: "yourstore.myshopify.com", hint: "Domain without https://" },
      { key: "shopify_admin_api_token", label: "Admin API Token", placeholder: "shpat_xxxxxxxxxxxxxxxxxxxxxxxx", secret: true, hint: "Shopify Admin → Apps → Develop apps → API credentials" },
    ],
  },
  {
    id: "facebook",
    label: "Facebook Ads",
    icon: ChartNoAxesCombined,
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
    icon: PackageCheck,
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
    icon: ShieldCheck,
    description: "Customer fraud detection",
    fields: [
      { key: "fraudshield_api_key", label: "API Key", placeholder: "Your FraudShield API key", secret: true, hint: "From fraudshield.bd dashboard" },
    ],
    testKey: "fraudshield",
  },
  {
    id: "facebook-messenger",
    label: "Facebook Messenger",
    icon: MessagesSquare,
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
    icon: PhoneCall,
    description: "AI bot for WhatsApp Business messages",
    fields: [
      { key: "wa_phone_number_id", label: "Phone Number ID", placeholder: "123456789012345", hint: "Meta Developer Console → WhatsApp → API Setup → Phone Number ID" },
      { key: "wa_access_token", label: "Access Token", placeholder: "EAAxxxxxxxxx", secret: true, hint: "Permanent system user token from Meta Business Suite" },
      { key: "wa_verify_token", label: "Webhook Verify Token", placeholder: "any-secret-string-you-choose", hint: `Webhook URL: https://dashboard.arclabtechnology.com/api/webhooks/whatsapp` },
    ],
  },
];

type Settings = Record<string, string>;

const INTEGRATION_CATEGORIES = ["All integrations", "Commerce", "Courier", "Marketing", "Social"] as const;
type IntegrationCategory = typeof INTEGRATION_CATEGORIES[number];

function integrationCategory(id: string): Exclude<IntegrationCategory, "All integrations"> {
  if (id === "shopify") return "Commerce";
  if (id === "steadfast" || id === "pathao") return "Courier";
  if (id === "facebook" || id === "fraudshield") return "Marketing";
  return "Social";
}

function integrationIconTone(id: string, active: boolean) {
  const tones: Record<string, string> = {
    shopify: "bg-emerald-100 text-emerald-700",
    facebook: "bg-blue-100 text-blue-700",
    steadfast: "bg-cyan-100 text-cyan-700",
    pathao: "bg-red-100 text-red-700",
    fraudshield: "bg-lime-100 text-lime-700",
    "facebook-messenger": "bg-indigo-100 text-indigo-700",
    "instagram-dm": "bg-pink-100 text-pink-700",
    "whatsapp-business": "bg-teal-100 text-teal-700",
  };
  return cn(tones[id] || "bg-slate-100 text-slate-700", !active && "opacity-70 saturate-50");
}

function FieldRow({ field, value, onChange }: { field: FieldDef; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{field.label}</label>
      <div className="relative">
        <input
          type={field.secret && !show ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="h-10 w-full rounded-xl border-0 bg-black/[0.055] px-3 pr-9 font-mono text-sm text-foreground outline-none transition-colors placeholder:font-sans placeholder:text-muted-foreground focus:ring-1 focus:ring-black/20"
        />
        {field.secret && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {field.hint && <p className="text-xs leading-relaxed text-muted-foreground">{field.hint}</p>}
    </div>
  );
}

function IntegrationRow({
  section,
  settings,
  onSave,
}: {
  section: SectionDef;
  settings: Settings;
  onSave: (patch: Settings) => Promise<void>;
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
    <div className={cn(
      "self-start overflow-hidden rounded-2xl border border-black/10 bg-white/55",
      open && "md:col-span-2 xl:col-span-3 2xl:col-span-4"
    )}>
      {/* Row header — click to expand */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[78px] w-full items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-black/[0.025]"
        data-testid={`button-expand-${section.id}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", integrationIconTone(section.id, isConfigured))}>
            <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{section.label}</p>
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{section.description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-semibold",
            isConfigured ? "bg-emerald-100 text-emerald-700" : "bg-black/[0.06] text-muted-foreground"
          )}>
            {isConfigured ? "Configured" : "Not set"}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
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
            <div className="border-t border-black/10 bg-white px-4 pb-5 pt-1">
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {section.fields.map((f) => (
                  <FieldRow
                    key={f.key}
                    field={f}
                    value={values[f.key] || ""}
                    onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
                  />
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-black px-4 text-sm font-medium text-white transition-colors hover:bg-black/85 disabled:opacity-30"
                  data-testid={`button-save-${section.id}`}
                >
                  {saving ? <Spinner size="sm" /> : <SaveIcon className="h-3 w-3" />}
                  Save
                </button>

                {(section.testKey === "fraudshield" || section.testKey === "facebook") && (
                  <>
                    <button
                      onClick={handleTest}
                      disabled={testing || !isConfigured}
                      className="flex h-9 items-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium text-foreground transition-all hover:bg-black/[0.035] disabled:opacity-30"
                      data-testid={`button-test-${section.id}`}
                    >
                      {testing ? <Spinner size="sm" />
                        : testStatus === "success" ? <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        : testStatus === "error" ? <XCircle className="h-3 w-3 text-red-500" />
                        : <ShieldCheck className="h-3 w-3 text-muted-foreground" />}
                      Test
                    </button>
                    {testStatus !== "idle" && (
                      <span className={cn("text-xs font-medium", testStatus === "success" ? "text-emerald-600" : "text-red-500")}>
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

function IntegrationListButton({
  section,
  settings,
  active,
  onClick,
}: {
  section: SectionDef;
  settings: Settings;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = section.icon;
  const isConfigured = section.fields.every((f) => !!(settings[f.key] || "").trim());

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-h-[70px] w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all",
        active
          ? "border-black/15 bg-black/[0.045]"
          : "border-black/10 bg-white/60 hover:border-black/15 hover:bg-black/[0.025]"
      )}
      data-testid={`button-select-${section.id}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", integrationIconTone(section.id, isConfigured))}>
          <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{section.label}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{section.description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={cn(
          "rounded-full px-2.5 py-1 text-[10px] font-semibold",
          isConfigured ? "bg-emerald-100 text-emerald-700" : "bg-black/[0.06] text-muted-foreground"
        )}>
          {isConfigured ? "Configured" : "Not set"}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", active && "-rotate-90")} />
      </div>
    </button>
  );
}

function IntegrationDetailCard({
  section,
  settings,
  onSave,
}: {
  section: SectionDef;
  settings: Settings;
  onSave: (patch: Settings) => Promise<void>;
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
    <motion.div
      key={section.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="overflow-hidden rounded-2xl border border-black/10 bg-white"
    >
      <div className="flex min-h-[76px] items-start justify-between gap-3 border-b border-black/10 px-4 py-3.5 pr-14">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", integrationIconTone(section.id, isConfigured))}>
            <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{section.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{section.description}</p>
          </div>
        </div>
        <span className={cn(
          "rounded-full px-2.5 py-1 text-[10px] font-semibold",
          isConfigured ? "bg-emerald-100 text-emerald-700" : "bg-black/[0.06] text-muted-foreground"
        )}>
          {isConfigured ? "Configured" : "Not set"}
        </span>
      </div>

      <div className="px-4 pb-5 pt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {section.fields.map((f) => (
            <FieldRow
              key={f.key}
              field={f}
              value={values[f.key] || ""}
              onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
            />
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-black px-4 text-sm font-medium text-white transition-colors hover:bg-black/85 disabled:opacity-30"
            data-testid={`button-save-${section.id}`}
          >
            {saving ? <Spinner size="sm" /> : <SaveIcon className="h-3 w-3" />}
            Save
          </button>

          {(section.testKey === "fraudshield" || section.testKey === "facebook") && (
            <>
              <button
                onClick={handleTest}
                disabled={testing || !isConfigured}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium text-foreground transition-all hover:bg-black/[0.035] disabled:opacity-30"
                data-testid={`button-test-${section.id}`}
              >
                {testing ? <Spinner size="sm" />
                  : testStatus === "success" ? <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  : testStatus === "error" ? <XCircle className="h-3 w-3 text-red-500" />
                  : <ShieldCheck className="h-3 w-3 text-muted-foreground" />}
                Test
              </button>
              {testStatus !== "idle" && (
                <span className={cn("text-xs font-medium", testStatus === "success" ? "text-emerald-600" : "text-red-500")}>
                  {testStatus === "success" ? "Connected" : "Failed"}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function IntegrationMarketplaceCard({
  section,
  settings,
  onConfigure,
}: {
  section: SectionDef;
  settings: Settings;
  onConfigure: () => void;
}) {
  const Icon = section.icon;
  const isConfigured = section.fields.every((f) => !!(settings[f.key] || "").trim());

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18 }}
      className="group flex min-h-[178px] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white transition-colors hover:border-black/20"
    >
      <div className="relative flex-1 px-4 pb-4 pt-4">
        <button
          type="button"
          aria-label={`Configure ${section.label}`}
          onClick={onConfigure}
          className="absolute right-3 top-3 rounded-lg p-1 text-muted-foreground opacity-60 transition-all hover:bg-black/[0.04] hover:text-foreground group-hover:opacity-100"
        >
          <ArrowLeftRight className="h-3.5 w-3.5 rotate-45" strokeWidth={1.8} />
        </button>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", integrationIconTone(section.id, isConfigured))}>
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div className="mt-4 pr-6">
          <p className="font-sf-display text-[15px] font-semibold leading-tight text-foreground">{section.label}</p>
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{section.description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-black/10 px-4 py-3">
        <button
          type="button"
          onClick={onConfigure}
          className="inline-flex h-8 items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-xs font-semibold text-foreground transition-all hover:bg-black/[0.035]"
          data-testid={`button-configure-${section.id}`}
        >
          <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={1.8} />
          Configure
        </button>
        <span
          className={cn(
            "relative h-5 w-9 rounded-full transition-colors",
            isConfigured ? "bg-[#7c3aed]" : "bg-black/15"
          )}
          aria-label={isConfigured ? "Configured" : "Not set"}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
              isConfigured ? "translate-x-[18px]" : "translate-x-0.5"
            )}
          />
        </span>
      </div>
    </motion.div>
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
    <div className="mt-5 overflow-hidden rounded-2xl border border-black/10 bg-white">
      <div className="flex h-[50px] items-center justify-between border-b border-black/10 px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <FileHeart className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <AnimatedText className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Brand Document</AnimatedText>
        </div>
        <span className="rounded-full bg-black/[0.06] px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
          AI Knowledge Base
        </span>
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-black/[0.025]"
        data-testid="button-expand-brand-doc"
      >
        <div className="flex items-center gap-4">
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700", !hasContent && "opacity-70 saturate-50")}>
            <FileHeart className="h-3.5 w-3.5" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Brand Knowledge Doc</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Paste your brand guide, FAQs, and policies for the AI support bot.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold", hasContent ? "bg-emerald-100 text-emerald-700" : "bg-black/[0.06] text-muted-foreground")}>
            {hasContent ? `${content.trim().split(/\s+/).length} words` : "Not set"}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
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
            <div className="border-t border-black/10 bg-white/55 px-6 pb-6 pt-2">
              {loading ? (
                <div className="mt-4 h-36 animate-pulse rounded-xl bg-black/[0.055]" />
              ) : (
                <>
                  <textarea
                    value={content}
                    onChange={(e) => { setContent(e.target.value); setSaved(false); }}
                    placeholder="Paste your brand guide, FAQs, product descriptions, shipping policies, return policies, brand tone of voice…&#10;&#10;The AI will use this to answer customer questions on Facebook, Instagram, and WhatsApp."
                    className="mt-4 h-48 w-full resize-y rounded-xl border-0 bg-black/[0.055] px-3 py-2.5 font-mono text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:ring-1 focus:ring-black/20"
                    data-testid="textarea-brand-doc"
                  />
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex h-9 items-center gap-1.5 rounded-xl bg-black px-4 text-sm font-medium text-white transition-colors hover:bg-black/85 disabled:opacity-30"
                      data-testid="button-save-brand-doc"
                    >
                      {saving ? <Spinner size="sm" /> : <SaveIcon className="h-3 w-3" />}
                      Save
                    </button>
                    {saved && (
                      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />
                        Saved
                      </span>
                    )}
                    {content.trim() && (
                      <span className="ml-auto text-xs text-muted-foreground">{content.trim().split(/\s+/).length} words · {content.length} chars</span>
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
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory>("All integrations");
  const [query, setQuery] = useState("");
  const [selectedSection, setSelectedSection] = useState<SectionDef | null>(null);

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

  const visibleSections = SECTIONS.filter((section) => {
    const matchesCategory = activeCategory === "All integrations" || integrationCategory(section.id) === activeCategory;
    const needle = `${section.label} ${section.description}`.toLowerCase();
    return matchesCategory && needle.includes(query.trim().toLowerCase());
  });

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="overflow-hidden rounded-2xl border border-black/10 bg-white"
      >
        {/* Panel header */}
        <div className="flex min-h-[66px] flex-col justify-center gap-1.5 border-b border-black/10 px-6 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <ChartNoAxesCombined className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <div>
              <AnimatedText as="p" className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Integrations</AnimatedText>
              <p className="text-xs text-muted-foreground">Connect the tools that power your commerce workflow.</p>
            </div>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {SECTIONS.filter((s) => s.fields.every((f) => !!(settings[f.key] || "").trim())).length}/{SECTIONS.length} configured
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-5 w-5 text-muted-foreground" />
          </div>
        ) : (
          <div className="p-4">
            <div className="flex flex-col gap-3 border-b border-black/10 pb-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex gap-2 overflow-x-auto">
                {INTEGRATION_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    className={cn(
                      "relative h-8 shrink-0 px-1 text-xs font-semibold transition-colors",
                      activeCategory === category ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {category}
                    {activeCategory === category && (
                      <motion.span
                        layoutId="integration-tab-indicator"
                        className="absolute inset-x-0 -bottom-[13px] h-0.5 rounded-full bg-[#7c3aed]"
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="relative w-full lg:w-[260px]">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search"
                  className="h-9 w-full rounded-xl border border-black/10 bg-white pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-black/20"
                />
              </div>
            </div>

            <motion.div layout className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {visibleSections.map((section) => (
                  <IntegrationMarketplaceCard
                    key={section.id}
                    section={section}
                    settings={settings}
                    onConfigure={() => setSelectedSection(section)}
                  />
                ))}
              </AnimatePresence>
            </motion.div>

            {visibleSections.length === 0 && (
              <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-black/10 text-sm text-muted-foreground">
                No integrations found.
              </div>
            )}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {selectedSection && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedSection(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="relative max-h-[86vh] w-full max-w-3xl overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setSelectedSection(null)}
                className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.06] text-muted-foreground transition-colors hover:bg-black/10 hover:text-foreground"
                aria-label="Close integration settings"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
              <IntegrationDetailCard
                section={selectedSection}
                settings={settings}
                onSave={handleSave}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BrandDocSection />
    </>
  );
}
