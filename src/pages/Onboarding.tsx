import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { LiquidMetalButton } from "@/components/ui/liquid-metal-button";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/useAuth";

export default function Onboarding() {
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

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

      // Wait for fresh /api/me data before navigating so DashboardLayout
      // sees orgName != "" and doesn't redirect back here
      await queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      await queryClient.refetchQueries({ queryKey: ["/api/me", user?.id] });

      sessionStorage.setItem("onboarding_done", "1");
      navigate("/", { replace: true });
    } catch {
      toast.error("Could not save business name. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    sessionStorage.setItem("onboarding_skipped", "1");
    navigate("/", { replace: true });
  };

  const smooth = { ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div className="min-h-screen w-full bg-white flex items-center justify-center px-8 py-16">
      <motion.div
        className="w-full max-w-sm flex flex-col items-center"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ...smooth, delay: 0.1 }}
      >

          {/* Heading */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ...smooth }}
            className="mb-8 space-y-2 text-center w-full"
          >
            <h1 className="text-3xl font-bold tracking-tight text-black">
              Name your workspace
            </h1>
            <p className="text-sm text-black font-light">
              Set up your Arc Lab Corporation account.
            </p>
          </motion.div>

          {/* Divider tabs — single step indicator matching auth tab row */}
          <div className="mb-8 w-full border-y border-black/[0.08] py-2 flex items-center justify-center">
            <span className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">
              Workspace Setup
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5 w-full">
            <div className="space-y-2">
              <label className="block text-center text-[9px] font-bold uppercase tracking-[0.25em] text-black">
                Business Name
              </label>
              <Input
                autoFocus
                placeholder="e.g. Arc Lab Corporation"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="h-12 bg-[#F8F8F6] border-black/[0.08] focus-visible:ring-1 focus-visible:ring-black focus-visible:border-black rounded-xl text-sm placeholder:text-black/30 transition-all"
                required
                data-testid="input-org-name"
              />
            </div>

            <div className="pt-2">
              <LiquidMetalButton
                type="submit"
                disabled={loading || !orgName.trim()}
                fullWidth
                label={loading ? "Saving…" : "Continue to Dashboard"}
              />
            </div>
          </form>

          {/* Footer */}
          <div className="mt-8 text-center space-y-3 w-full">
            <p className="text-xs text-black">
              <button
                type="button"
                onClick={handleSkip}
                className="font-semibold text-black underline underline-offset-2 hover:text-black/60 transition-colors"
              >
                Skip for now
              </button>
            </p>
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-black/40">
              You can update this in Settings
            </p>
          </div>

      </motion.div>
    </div>
  );
}
