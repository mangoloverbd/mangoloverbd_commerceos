import { useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { useOrgName } from "@/hooks/useOrgName";
import { TeamManagement } from "@/components/TeamManagement";
import { IntegrationSettings } from "@/components/IntegrationSettings";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
    <div className="border border-black/[0.07] bg-white p-6">
      <p className="text-[8px] font-medium tracking-[0.35em] text-black uppercase mb-5">
        Business Name
      </p>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-black" />
      ) : (
        <div className="flex gap-3 items-center">
          <Input
            value={displayValue}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. Arc Lab Technology"
            className="h-10 max-w-sm bg-white border-black/[0.1] focus-visible:ring-1 focus-visible:ring-black focus-visible:border-black rounded-none text-sm placeholder:text-black/40"
          />
          <button
            onClick={handleSave}
            disabled={saving || !displayValue.trim() || displayValue.trim() === orgName}
            className="h-10 px-6 bg-black text-white text-[9px] font-medium tracking-[0.3em] uppercase disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/85 transition-colors"
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
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8]">
        <Loader2 className="h-4 w-4 animate-spin text-black" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="px-6 py-6 space-y-4">
        <BusinessNameCard />
        <TeamManagement />
        <IntegrationSettings />
      </div>
    </div>
  );
}
