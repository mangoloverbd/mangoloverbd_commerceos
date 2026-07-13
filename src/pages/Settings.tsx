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
import { Building2, Puzzle, Lock } from "lucide-react";
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
    } catch (err: any) {
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
    <div className="space-y-4">
      <div>
        <h2 className="text-[17px] font-semibold text-black tracking-tight">AI Auto-Reply</h2>
        <p className="mt-0.5 text-[13px] text-black/45">Control AI responses for each social channel.</p>
      </div>
      <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white divide-y divide-black/[0.06]">
        {/* Master toggle */}
        <div className="flex items-center justify-between gap-4 px-5 py-4">
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
        </div>

        {/* Per-channel toggles */}
        {AI_CHANNELS.map(({ id, label, icon: Icon }) => (
          <div
            key={id}
            className={cn(
              "flex items-center justify-between gap-4 px-5 py-4 transition-opacity",
              !enabled && "opacity-40 pointer-events-none"
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Icon weight="light" size={18} className="shrink-0 text-black/60" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-black">{label}</p>
              </div>
            </div>
            <Switch
              checked={channels.includes(id)}
              onCheckedChange={() => toggleChannel(id)}
              disabled={saving !== null || !enabled}
              className="shrink-0"
            />
          </div>
        ))}
      </div>
    </div>
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
    <div className="space-y-8">
      <div className="space-y-4">
        <div>
          <h2 className="text-[17px] font-semibold text-black tracking-tight">Workspace</h2>
          <p className="mt-0.5 text-[13px] text-black/45">Manage your organisation identity.</p>
        </div>
        <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white divide-y divide-black/[0.06]">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-black">Business Name</p>
              <p className="text-[11px] text-black/40 mt-0.5">Appears across your dashboard and reports.</p>
            </div>
            {isLoading ? (
              <Spinner className="h-4 w-4 text-black/30 shrink-0" />
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <Input
                  value={displayValue}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Merchant-Suite Corporation"
                  className="h-8 w-48 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px] text-black placeholder:text-black/25 focus-visible:ring-1 focus-visible:ring-black/20"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-[17px] font-semibold text-black tracking-tight">Team</h2>
          <p className="mt-0.5 text-[13px] text-black/45">Manage members and access.</p>
        </div>
        <TeamManagement />
      </div>

      <AIAutoReplySection />
      <BulkSmsSection />
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
      <div className="flex justify-center items-center gap-1 border-b border-black/[0.07] px-5 pt-4 pb-0">
        {visibleNav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={cn(
              "relative flex items-center gap-2 px-3 pb-3 text-[13px] font-medium transition-colors",
              section === id ? "text-black" : "text-black/40 hover:text-black/70"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
            {label}
            {section === id && (
              <motion.span
                layoutId="settings-tab-indicator"
                className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-black"
              />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-0 overflow-auto px-6 py-6">
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
  );
}
