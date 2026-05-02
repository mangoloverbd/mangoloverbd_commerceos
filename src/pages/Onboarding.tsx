import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

export default function Onboarding() {
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = orgName.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      const res = await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { org_name: trimmed } }),
      });
      if (!res.ok) throw new Error("Failed to save");
      sessionStorage.removeItem("onboarding_skipped");
      await queryClient.invalidateQueries({ queryKey: ["/api/settings/org_name"] });
      navigate("/");
    } catch {
      toast.error("Could not save organisation name. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Icon */}
        <div className="flex justify-center mb-10">
          <div className="h-12 w-12 bg-black flex items-center justify-center">
            <Building2 className="h-5 w-5 text-white" />
          </div>
        </div>

        {/* Heading */}
        <div className="text-center mb-10 space-y-3">
          <p className="text-[8px] font-medium tracking-[0.35em] text-black uppercase">
            Welcome
          </p>
          <h1 className="text-3xl font-light text-black tracking-tight">
            Set up your workspace
          </h1>
          <p className="text-sm text-black font-light leading-relaxed">
            Enter your organisation name — it will appear across your dashboard.
          </p>
        </div>

        {/* Form panel */}
        <form onSubmit={handleSubmit}>
          <div className="border border-black/[0.07] bg-white p-8 space-y-6">
            <div className="space-y-2">
              <label className="block text-[8px] font-medium tracking-[0.3em] text-black uppercase">
                Organisation Name
              </label>
              <Input
                autoFocus
                placeholder="e.g. Arc Lab Technology"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="h-11 bg-white border-black/[0.1] focus-visible:ring-1 focus-visible:ring-black focus-visible:border-black rounded-none text-sm placeholder:text-black"
                required
                data-testid="input-org-name"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !orgName.trim()}
              data-testid="button-save-org"
              className="w-full h-11 bg-black text-white text-[9px] font-medium tracking-[0.3em] uppercase disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/85 transition-colors"
            >
              {loading ? "Saving…" : "Continue to Dashboard"}
            </button>
          </div>
        </form>

        {/* Skip */}
        <p className="text-center mt-6 text-[9px] text-black tracking-[0.2em] uppercase">
          <button
            type="button"
            onClick={() => { sessionStorage.setItem("onboarding_skipped", "1"); navigate("/"); }}
            className="hover:text-black transition-colors"
          >
            Skip for now
          </button>
        </p>
      </motion.div>
    </div>
  );
}
