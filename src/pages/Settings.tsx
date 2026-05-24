import { useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { useOrgName } from "@/hooks/useOrgName";
import { TeamManagement } from "@/components/TeamManagement";
import { IntegrationSettings } from "@/components/IntegrationSettings";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/ios-spinner";
import { Store } from "lucide-react";
import { AnimatedText } from "@/components/ui/animated-text";

function BusinessNameCard() {
  const { orgName, isLoading, refresh } = useOrgName();
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Use controlled value once user starts editing; otherwise show fetched name
  const displayValue = value !== null ? value : orgName;

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
      toast.error("Could not save business name. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
      <div className="flex h-[50px] items-center justify-between border-b border-black/10 px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <Store className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <AnimatedText as="p" className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Business Name</AnimatedText>
        </div>
        <span className="text-xs font-medium text-muted-foreground">Workspace identity</span>
      </div>
      {isLoading ? (
        <div className="flex items-center px-6 py-5">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-3 px-6 py-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <Input
            value={displayValue}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. Arc Lab Technology"
            className="h-10 rounded-xl border-0 bg-black/[0.055] text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-black/20"
          />
          <button
            onClick={handleSave}
            disabled={saving || !displayValue.trim() || displayValue.trim() === orgName}
            className="h-10 rounded-xl bg-black px-5 text-sm font-medium text-white transition-colors hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { loading } = useUserRole();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#e9e9e9]">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-[1800px] space-y-5 p-1 lg:p-2">
        <BusinessNameCard />
        <TeamManagement />
        <IntegrationSettings />
      </div>
    </div>
  );
}
