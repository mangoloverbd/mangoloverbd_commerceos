import { useState, useEffect, useCallback, useRef } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { useOrgName } from "@/hooks/useOrgName";
import { TeamManagement } from "@/components/TeamManagement";
import { IntegrationSettings } from "@/components/IntegrationSettings";
import { BulkSmsSection } from "@/components/BulkSmsSection";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast, dismiss } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/ios-spinner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Building2, Puzzle, Lock, Globe, Bot, Users, MessageSquare, SlidersHorizontal } from "lucide-react";
import { MessengerLogo, InstagramLogo, WhatsappLogo } from "@phosphor-icons/react";

type Section = "workspace" | "integrations";

const NAV: { id: Section; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { id: "workspace",    label: "Workspace",    icon: Building2 },
  { id: "integrations", label: "Integrations", icon: Puzzle, adminOnly: true },
];

const AI_CHANNELS = [
  { id: "whatsapp", label: "WhatsApp", icon: WhatsappLogo },
  { id: "instagram", label: "Instagram DMs", icon: InstagramLogo },
  { id: "facebook", label: "Facebook Messenger", icon: MessengerLogo },
] as const;

/* ── BoardUI-style layout primitives ─────────────────────────────────────── */

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black/[0.05] text-black/55">
        <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <h1 className="font-sf-display text-[22px] font-semibold tracking-tight text-black leading-tight">{title}</h1>
        <p className="mt-0.5 text-[13px] text-black/45 leading-tight">{description}</p>
      </div>
    </div>
  );
}

function GroupCard({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2.5 px-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/[0.05] text-black/55">
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-black leading-none">{title}</h2>
          {description && <p className="mt-1 text-[12px] text-black/45 leading-none">{description}</p>}
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl bg-black/[0.04] pl-3">
        {children}
      </div>
    </section>
  );
}

function GroupSection({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2.5 px-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/[0.05] text-black/55">
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-black leading-none">{title}</h2>
          {description && <p className="mt-1 text-[12px] text-black/45 leading-none">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-[52px] items-center justify-between gap-4 py-2.5 pr-2.5", className)}>{children}</div>
  );
}

function IconTile({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] text-black/55", className)}>
      {children}
    </span>
  );
}

/* ── Workspace sections ──────────────────────────────────────────────────── */

function AIAutoReplySection() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [channels, setChannels] = useState<string[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch("/api/meta/status");
      if (res.ok) {
        const data = await res.json();
        setEnabled(data.aiAutomation?.enabled ?? false);
        setChannels(data.aiAutomation?.channels ?? []);
      }
    } catch {
      // silently fail — section just won't show toggles
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const patchAI = async (body: { enabled?: boolean; channels?: string[] }) => {
    setSaving(body.enabled !== undefined ? "master" : body.channels?.[0] || null);
    try {
      const res = await apiFetch("/api/meta/ai-automation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to update");
      if (body.enabled !== undefined) setEnabled(body.enabled);
      if (body.channels !== undefined) setChannels(body.channels);
      toast.success("AI auto-reply updated");
    } catch (err) {
      toast.error(err?.message || "Failed to update");
    } finally {
      setSaving(null);
    }
  };

  const toggleChannel = (ch: string) => {
    const next = channels.includes(ch)
      ? channels.filter((c) => c !== ch)
      : [...channels, ch];
    patchAI({ channels: next });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Spinner className="h-4 w-4 text-black/30" />
      </div>
    );
  }

  return (
    <GroupCard icon={Bot} title="AI Auto-Reply" description="Control AI responses for each social channel.">
      <div className="divide-y divide-black/[0.06]">
        <Row>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-black">Enable AI Auto-Reply</p>
            <p className="text-[11px] text-black/40 mt-0.5">Master switch — turns off AI replies on all channels when disabled.</p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => patchAI({ enabled: v })}
            disabled={saving !== null}
            className="shrink-0"
          />
        </Row>

        {AI_CHANNELS.map(({ id, label, icon: Icon }) => (
          <Row
            key={id}
            className={cn(
              "transition-opacity",
              !enabled && "opacity-40 pointer-events-none"
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <IconTile>
                <Icon weight="light" size={16} />
              </IconTile>
              <p className="text-[13px] font-medium text-black">{label}</p>
            </div>
            <Switch
              checked={channels.includes(id)}
              onCheckedChange={() => toggleChannel(id)}
              disabled={saving !== null || !enabled}
              className="shrink-0"
            />
          </Row>
        ))}
      </div>
    </GroupCard>
  );
}

function StorefrontDomainSection() {
  const { isAdmin } = useUserRole();
  const [settings, setSettings] = useState<{
    customDomain: string | null;
    customDomainStatus: string | null;
    dnsRecord: { type: string; host: string; value: string } | null;
  } | null>(null);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    domain: string;
    status: string;
    cnameTarget: string | null;
    dnsRecord: { type: string; host: string; value: string } | null;
    error: string | null;
  } | null>(null);
  const [polling, setPolling] = useState(false);
  const [provisioned, setProvisioned] = useState<{ url: string } | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  const loadProvision = useCallback(async () => {
    try {
      const res = await apiFetch("/api/storefront/provision");
      if (res.ok) {
        const data = await res.json();
        if (data.provisioned) setProvisioned({ url: data.url });
      }
    } catch {
      // silent
    }
  }, []);
  useEffect(() => { loadProvision(); }, [loadProvision]);

  const provision = async () => {
    setProvisioning(true);
    setProvisionError(null);
    try {
      const res = await apiFetch("/api/storefront/provision", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Provisioning failed");
      setProvisioned({ url: data.url });
      toast.success("Storefront deployed — live at " + data.url);
    } catch (e) {
      setProvisionError((e as Error)?.message || "Provisioning failed");
    } finally { setProvisioning(false); }
  };

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/storefront/settings");
      if (!res.ok) return;
      const data = await res.json();
      const s = data.settings;
      setSettings(s);
      setInput(s.customDomain || "");
    } catch {
      // silent
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const refreshStatus = useCallback(async () => {
    setPolling(true);
    try {
      const res = await apiFetch("/api/storefront/domain-status");
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        await load();
      }
    } catch {
      // silent
    } finally { setPolling(false); }
  }, [load]);

  const save = async () => {
    const value = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    setSaving(true);
    try {
      const res = await apiFetch("/api/storefront/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { customDomain: value } }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }
      const data = await res.json();
      setResult(data.domainStatus);
      await load();
      toast.success(data.domainStatus?.error ? "Saved — see DNS instructions" : "Domain connected");
    } catch (e) {
      toast.error((e as Error)?.message || "Save failed");
    } finally { setSaving(false); }
  };

  const disconnect = async () => {
    setInput("");
    setSaving(true);
    try {
      const res = await apiFetch("/api/storefront/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { customDomain: "" } }),
      });
      if (!res.ok) throw new Error("Disconnect failed");
      setResult(null);
      await load();
      toast.success("Custom domain removed");
    } catch (e) {
      toast.error((e as Error)?.message || "Disconnect failed");
    } finally { setSaving(false); }
  };

  if (!isAdmin) return null;
  const status = result?.status || settings?.customDomainStatus || null;
  const dns = result?.dnsRecord || settings?.dnsRecord || null;

  const statusBadge = (st: string | null) => {
    if (st === "verified") return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">Connected</span>;
    if (st === "pending") return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">Pending DNS</span>;
    if (st === "failed") return <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-500">Failed</span>;
    return null;
  };

  return (
    <GroupCard icon={Globe} title="Storefront" description="Deploy your storefront and connect your own domain.">
      <div className="divide-y divide-black/[0.06]">
        <Row>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-black">Deploy Storefront</p>
            <p className="text-[11px] text-black/40 mt-0.5">
              {provisioned
                ? <>Live at <a href={provisioned.url} target="_blank" rel="noreferrer" className="underline text-black/60">{provisioned.url}</a></>
                : "Automatically creates your storefront from our default template."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {provisioned ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-600">Deployed</span>
            ) : (
              <button
                onClick={provision}
                disabled={provisioning}
                className="rounded-lg bg-black px-3.5 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-black/90 disabled:opacity-50"
              >{provisioning ? "Deploying…" : "Provision Storefront"}</button>
            )}
          </div>
        </Row>
        {provisionError ? <p className="px-5 pb-2 text-[11px] text-red-500">{provisionError}</p> : null}

        <Row>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-black">Custom Domain</p>
            <p className="text-[11px] text-black/40 mt-0.5">e.g. shop.stepprs.com — we attach it to your storefront on Save.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="shop.yourbrand.com"
              className="h-9 w-56 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px] text-black placeholder:text-black/25 focus-visible:ring-1 focus-visible:ring-black/20"
            />
            {statusBadge(status)}
          </div>
        </Row>

        {dns ? (
          <div className="px-5 py-4">
            <p className="text-[11px] font-medium text-black/50 uppercase tracking-[0.12em] mb-2">DNS record to set</p>
            <div className="font-mono text-[12px] text-black/70 space-y-1">
              <p><span className="text-black/40">Type:</span> {dns.type}</p>
              <p><span className="text-black/40">Host/Name:</span> {dns.host}</p>
              <p><span className="text-black/40">Value:</span> {dns.value}</p>
            </div>
            <p className="mt-2 text-[11px] text-black/40">
              Set this at your DNS provider, then click "Check status". It may take a few minutes to propagate.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-black px-3.5 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-black/90 disabled:opacity-50"
              >Save</button>
              <button
                onClick={refreshStatus}
                disabled={polling}
                className="rounded-lg border border-black/[0.1] px-3.5 py-2 text-[12.5px] font-medium text-black transition-colors hover:bg-black/[0.04] disabled:opacity-50"
              >{polling ? "Checking…" : "Check status"}</button>
              {settings?.customDomain && (
                <button
                  onClick={disconnect}
                  disabled={saving}
                  className="rounded-lg px-3.5 py-2 text-[12.5px] font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
                >Disconnect</button>
              )}
            </div>
            {result?.error ? <p className="mt-2 text-[11px] text-amber-600">{result.error}</p> : null}
          </div>
        ) : (
          <div className="px-5 py-4 flex gap-2">
            <button
              onClick={save}
              disabled={saving || !input.trim()}
              className="rounded-lg bg-black px-3.5 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-black/90 disabled:opacity-50"
            >Save</button>
          </div>
        )}
      </div>
    </GroupCard>
  );
}

function WorkspaceSection() {
  const { orgName, isLoading, refresh } = useOrgName();
  const [value, setValue] = useState<string | null>(null);
  const displayValue = value !== null ? value : orgName;
  const isDirty = displayValue.trim() !== orgName && displayValue.trim() !== "";
  const latestValue = useRef(displayValue);
  latestValue.current = displayValue;
  const savedRef = useRef(false);
  const toastId = useRef<string | null>(null);

  useEffect(() => {
    if (isDirty && !toastId.current) {
      toastId.current = toast.unsaved({
        message: "Unsaved changes",
        savingText: "Saving",
        savedText: "Business name saved",
        onSave: async () => {
          const trimmed = latestValue.current.trim();
          if (!trimmed) return;
          const res = await apiFetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ settings: { org_name: trimmed } }),
          });
          if (!res.ok) throw new Error("Save failed");
          refresh();
        },
        onSaved: () => {
          savedRef.current = true;
          setValue(null);
        },
        onReset: () => setValue(null),
      });
    } else if (!isDirty && toastId.current && !savedRef.current) {
      dismiss(toastId.current);
      toastId.current = null;
    }
  }, [isDirty, refresh]);

  return (
    <div className="space-y-10">
      <PageHeader title="Workspace" description="Manage your organisation, team, and connected services." />

      <GroupCard icon={Building2} title="Business Name" description="Appears across your dashboard and reports.">
        <Row>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-black">Display name</p>
            <p className="text-[11px] text-black/40 mt-0.5">This is your organisation's public name.</p>
          </div>
          {isLoading ? (
            <Spinner className="h-4 w-4 text-black/30 shrink-0" />
          ) : (
            <Input
              value={displayValue}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Merchant-Suite Corporation"
              className="h-9 w-56 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px] text-black placeholder:text-black/25 focus-visible:ring-1 focus-visible:ring-black/20"
            />
          )}
        </Row>
      </GroupCard>

      <GroupSection icon={Users} title="Team" description="Manage members and access.">
        <TeamManagement />
      </GroupSection>

      <AIAutoReplySection />

      <GroupSection icon={MessageSquare} title="Bulk SMS" description="Automated SMS updates for confirmed and dispatched orders.">
        <BulkSmsSection />
      </GroupSection>

      <StorefrontDomainSection />
    </div>
  );
}

function TabNav({ items, value, onChange }: { items: typeof NAV; value: Section; onChange: (s: Section) => void }) {
  return (
    <div className="flex justify-center">
      <div className="inline-flex items-center gap-1 rounded-full bg-black/[0.05] p-1">
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
              value === id
                ? "bg-white text-black shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                : "text-black/50 hover:text-black/80"
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Settings() {
  const { loading, isAdmin } = useUserRole();
  const [section, setSection] = useState<Section>("workspace");

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-5 w-5 text-black/30" />
      </div>
    );
  }

  const visibleNav = NAV.filter((n) => !n.adminOnly || isAdmin);

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-black/[0.06] bg-white/80 px-6 py-3 backdrop-blur-md">
        <TabNav items={visibleNav} value={section} onChange={setSection} />
      </div>

      <div className="flex-1 min-w-0 overflow-auto bg-white px-6 py-8">
        <div className="w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
            >
              {section === "workspace" && <WorkspaceSection />}
              {section === "integrations" && (
                isAdmin ? <IntegrationSettings /> : (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-black/30">
                    <Lock className="h-6 w-6" strokeWidth={1.5} />
                    <p className="text-[13px]">Only admins can manage integrations.</p>
                  </div>
                )
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
