import { useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { useOrgName } from "@/hooks/useOrgName";
import { TeamManagement } from "@/components/TeamManagement";
import { IntegrationSettings } from "@/components/IntegrationSettings";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/ios-spinner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Building2, Puzzle, Lock } from "lucide-react";

type Section = "workspace" | "integrations";

const NAV: { id: Section; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { id: "workspace",    label: "Workspace",    icon: Building2 },
  { id: "integrations", label: "Integrations", icon: Puzzle, adminOnly: true },
];

function SaveIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17.9808V12.7075C3 9.07416 3 7.25748 4.09835 6.12874C5.1967 5 6.96447 5 10.5 5C14.0355 5 15.8033 5 16.9017 6.12874C18 7.25748 18 9.07416 18 12.7075V17.9808C18 20.2867 18 21.4396 17.2755 21.8523C15.8724 22.6514 13.2405 19.9852 11.9906 19.1824C11.2657 18.7168 10.9033 18.484 10.5 18.484C10.0967 18.484 9.73425 18.7168 9.00938 19.1824C7.7595 19.9852 5.12763 22.6514 3.72454 21.8523C3 21.4396 3 20.2867 3 17.9808Z" />
      <path d="M9 2H11C15.714 2 18.0711 2 19.5355 3.46447C21 4.92893 21 7.28595 21 12V18" />
    </svg>
  );
}

function WorkspaceSection() {
  const { orgName, isLoading, refresh } = useOrgName();
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const displayValue = value !== null ? value : orgName;
  const isDirty = displayValue.trim() !== orgName && displayValue.trim() !== "";

  const handleSave = async () => {
    const trimmed = displayValue.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { org_name: trimmed } }),
      });
      if (!res.ok) throw new Error("Save failed");
      refresh();
      setValue(null);
      toast.success("Business name updated.");
    } catch {
      toast.error("Could not save business name.");
    } finally {
      setSaving(false);
    }
  };

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
                  onKeyDown={(e) => e.key === "Enter" && isDirty && handleSave()}
                  placeholder="Arc Lab Corporation"
                  className="h-8 w-48 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px] text-black placeholder:text-black/25 focus-visible:ring-1 focus-visible:ring-black/20"
                />
                {isDirty && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-white transition-colors hover:bg-black/80 disabled:opacity-40 shrink-0"
                  >
                    {saving ? <Spinner size="sm" /> : <SaveIcon className="h-3.5 w-3.5" />}
                  </button>
                )}
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
