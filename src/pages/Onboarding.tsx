import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { RichButton } from "@/components/ui/rich-button";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/logo";

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
    <div className="min-h-screen w-full flex items-center justify-center bg-[#FAFAF8] px-8 py-16" style={{ fontFamily: "'Suisse Intl', 'Geist Sans', system-ui, sans-serif" }}>
      <motion.div
        className="w-full max-w-[430px] flex flex-col items-center"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ...smooth }}
      >
        {/* Logo */}
        <div className="mb-10 flex items-center gap-2">
          <Logo className="h-6 w-6 rounded-md shrink-0" />
          <span className="text-[18px] font-semibold leading-none tracking-normal text-black">
            Arc Lab
          </span>
          <span
            className="text-[20px] font-semibold leading-none tracking-normal text-black"
            style={{ fontFamily: "'Pixelify Sans', system-ui, sans-serif" }}
          >
            Suite
          </span>
        </div>

        {/* Card */}
        <div className="w-full bg-white rounded-md border border-black/[0.06] shadow-sm p-8 sm:p-10">
          <div className="flex flex-col items-center mb-6">
            <h1 className="text-[28px] font-bold tracking-[-0.02em] text-black">
              Name your workspace
            </h1>
            <p className="text-[13px] text-black/40 mt-2">
              Set up your Arc Lab Suite account.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="org-name" className="text-[13px] font-semibold text-black">
                Business Name
              </label>
              <input
                id="org-name"
                autoFocus
                placeholder="e.g. Arc Lab Corporation"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full h-[44px] bg-white border border-black/[0.12] rounded-lg text-[14px] text-black placeholder:text-black/35 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black/20 transition-all duration-200 px-4"
                required
                data-testid="input-org-name"
              />
            </div>

            <RichButton
              type="submit"
              disabled={loading || !orgName.trim()}
              color="default"
              size="lg"
              className="w-full mt-2 h-11 rounded-lg"
            >
              {loading ? "Saving…" : "Continue to Dashboard"}
            </RichButton>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-[13px] text-black/45">
            <button
              type="button"
              onClick={handleSkip}
              className="text-black font-semibold underline hover:text-black/70 transition-colors duration-200"
            >
              Skip for now
            </button>
            <span className="text-black/30 mx-2">—</span>
            <span className="text-black/40">You can update this in Settings</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
