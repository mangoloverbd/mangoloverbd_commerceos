import { useState, useEffect, useCallback } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { useOrgName } from "@/hooks/useOrgName";
import { TeamManagement } from "@/components/TeamManagement";
import { IntegrationSettings } from "@/components/IntegrationSettings";
import { BulkSmsSection } from "@/components/BulkSmsSection";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/ios-spinner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Building2, Puzzle, Lock } from "lucide-react";
import { MessengerLogo, InstagramLogo, WhatsAppLogo } from "@/components/IntegrationLogos";
import { Check, PencilSimple } from "@phosphor-icons/react";

type Section = "workspace" | "integrations";

const NAV: { id: Section; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { id: "workspace",    label: "Workspace",    icon: Building2 },
  { id: "integrations", label: "Integrations", icon: Puzzle, adminOnly: true },
];

const AI_CHANNELS = [
  { id: "whatsapp", label: "WhatsApp", icon: WhatsAppLogo },
  { id: "instagram", label: "Instagram DMs", icon: InstagramLogo },
  { id: "facebook", label: "Facebook Messenger", icon: MessengerLogo },
] as const;

/* ── BoardUI-style layout primitives ─────────────────────────────────────── */

const sectionLabel = "text-[8px] font-medium uppercase tracking-[0.3em] text-black";

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-[26px] font-light leading-tight tracking-[-0.025em] text-black">{title}</h1>
      <p className="mt-1 text-[14px] text-black/50">{description}</p>
    </div>
  );
}

function SectionHeading({ title, description, meta }: { title: string; description?: string; meta?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 px-1">
      <div className="min-w-0">
        <p className={sectionLabel}>{title}</p>
        {description && <p className="mt-1.5 text-[12px] text-black/50">{description}</p>}
      </div>
      {meta && <div className="shrink-0 text-[12px] text-black/50">{meta}</div>}
    </div>
  );
}

function GroupCard({
  title,
  description,
  meta,
  children,
  className,
}: {
  title: string;
  description?: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <SectionHeading title={title} description={description} meta={meta} />
      <div className="overflow-hidden rounded-[18px] border border-black/[0.06] bg-white px-5">
        {children}
      </div>
    </section>
  );
}

function GroupSection({
  title,
  description,
  meta,
  children,
  className,
}: {
  title: string;
  description?: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <SectionHeading title={title} description={description} meta={meta} />
      {children}
    </section>
  );
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-[60px] items-center justify-between gap-4 py-3", className)}>{children}</div>
  );
}

function LogoTile({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
        className,
      )}
    >
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
    <GroupCard
      title="AI Auto-Reply"
      description="Control AI responses for each social channel."
      meta={
        <span className={cn("inline-flex items-center gap-1.5", enabled ? "text-emerald-700" : "text-black/50")}>
          <span className={cn("h-1.5 w-1.5 rounded-full", enabled ? "bg-emerald-500" : "bg-black/20")} />
          {enabled ? `On for ${channels.length} channel${channels.length === 1 ? "" : "s"}` : "Off"}
        </span>
      }
    >
      <div className="divide-y divide-black/[0.06]">
        <Row>
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-black">Enable AI Auto-Reply</p>
            <p className="mt-0.5 text-[12px] text-black/50">Master switch — turns off AI replies on all channels when disabled.</p>
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
              <LogoTile>
                <Icon className="h-[22px] w-[22px]" />
              </LogoTile>
              <p className="text-[14px] font-medium text-black">{label}</p>
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

// The Storefront section (deploy + custom domain) is hidden for now; flip to true to bring it back.
const SHOW_STOREFRONT_SECTION = false;

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
    <GroupCard title="Storefront" description="Deploy your storefront and connect your own domain.">
      <div className="divide-y divide-black/[0.06]">
        <Row>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-black">Deploy Storefront</p>
            <p className="text-[11px] text-black mt-0.5">
              {provisioned
                ? <>Live at <a href={provisioned.url} target="_blank" rel="noreferrer" className="underline text-black">{provisioned.url}</a></>
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
            <p className="text-[11px] text-black mt-0.5">e.g. shop.stepprs.com — we attach it to your storefront on Save.</p>
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
            <p className="text-[11px] font-medium text-black uppercase tracking-[0.12em] mb-2">DNS record to set</p>
            <div className="font-mono text-[12px] text-black space-y-1">
              <p><span className="text-black">Type:</span> {dns.type}</p>
              <p><span className="text-black">Host/Name:</span> {dns.host}</p>
              <p><span className="text-black">Value:</span> {dns.value}</p>
            </div>
            <p className="mt-2 text-[11px] text-black">
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

function BusinessCard() {
  const { orgName, isLoading, refresh } = useOrgName();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setDraft(orgName);
    setEditing(true);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || saving) return;
    if (trimmed === orgName) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { org_name: trimmed } }),
      });
      if (!res.ok) throw new Error("Save failed");
      await refresh();
      setEditing(false);
      toast.success("Business name saved");
    } catch {
      toast.error("Could not save the business name");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-wrap items-center gap-4 rounded-[18px] border border-[#F3DFB4] bg-[#FFF8EB] px-5 py-4">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-black/[0.06] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.08)]">
        <img src="/brand/mango-lover-logo.webp" alt="" className="h-full w-full scale-110 object-contain" />
      </span>

      <div className="min-w-0 flex-1 basis-56">
        <p className={sectionLabel}>Business name</p>
        <AnimatePresence mode="wait" initial={false}>
          {editing ? (
            <motion.form
              key="edit"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              onSubmit={(e) => { e.preventDefault(); void save(); }}
              className="mt-1.5 flex flex-wrap items-center gap-2"
            >
              <Input
                autoFocus
                aria-label="Business name"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
                placeholder="Mango Lover BD"
                className="h-9 w-full max-w-xs rounded-[10px] border-black/[0.12] bg-white text-[14px] text-black placeholder:text-black/25 focus-visible:ring-1 focus-visible:ring-black/20"
              />
              <button
                type="submit"
                disabled={saving || !draft.trim()}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-black px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-black/85 disabled:opacity-40"
              >
                {saving ? <Spinner size="sm" className="text-white" /> : <Check weight="light" size={14} />}
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="h-9 rounded-[10px] px-3 text-[13px] text-black/60 transition-colors hover:text-black"
              >
                Cancel
              </button>
            </motion.form>
          ) : (
            <motion.div
              key="view"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              className="mt-1"
            >
              <p className="truncate text-[18px] font-medium tracking-[-0.01em] text-black">
                {isLoading ? "…" : orgName || "Your business"}
              </p>
              <p className="truncate text-[12px] text-black/55">Shown across the dashboard and reports.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!editing && (
        <button
          type="button"
          onClick={startEditing}
          disabled={isLoading}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-black/[0.1] bg-white px-3.5 text-[13px] font-medium text-black shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:bg-black/[0.03] disabled:opacity-50"
        >
          <PencilSimple weight="light" size={15} />
          Edit name
        </button>
      )}
    </section>
  );
}

function WorkspaceSection() {
  return (
    <div className="space-y-8">
      <PageHeader title="Workspace" description="Manage your organisation, team, and connected services." />

      <BusinessCard />

      <GroupSection title="Team" description="Manage members and access.">
        <TeamManagement />
      </GroupSection>

      <AIAutoReplySection />

      <GroupSection title="Bulk SMS" description="Automated SMS updates for confirmed and dispatched orders.">
        <BulkSmsSection />
      </GroupSection>

      {SHOW_STOREFRONT_SECTION && <StorefrontDomainSection />}
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
                : "text-black hover:text-black/80"
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

      <div className="flex-1 min-w-0 overflow-auto bg-white px-3 pb-8 pt-3">
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
                isAdmin ? (
                  <>
                    <IntegrationSettings />
                  </>
                ) : (
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
