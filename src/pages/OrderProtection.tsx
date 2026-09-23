import { motion } from "framer-motion";
import { useState } from "react";
import { OrderProtectionReviewQueue } from "@/components/OrderProtectionReviewQueue";
import { RiskAccuracyPanel, RiskAttemptsPanel, RiskListsPanel, RiskSettingsPanel } from "@/components/risk/RiskDashboard";

export default function OrderProtection() {
  const [tab, setTab] = useState<"reviews" | "attempts" | "lists" | "accuracy" | "settings">("reviews");
  return (
    <div className="min-h-full space-y-6 bg-[#FAFAF8] p-1 max-md:p-2 lg:p-2">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative space-y-4"
      >
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-sf-display text-[22px] font-bold tracking-tight text-black">Order Protection</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-black/45">
              Review held orders and investigate checkout risk signals.
            </p>
          </div>
        </div>
      </motion.div>

      <div role="tablist" aria-label="Order protection" className="flex gap-5 border-b border-black/10 text-sm">
        {([ ["reviews", "Reviews"], ["attempts", "Attempts"], ["lists", "Lists"], ["accuracy", "Accuracy"], ["settings", "Settings"] ] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} className={`pb-3 ${tab === value ? "border-b border-black text-black" : "text-black/50"}`} onClick={() => setTab(value)}>{label}</button>)}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="overflow-hidden rounded-2xl bg-white"
        role="tabpanel"
        aria-label={tab === "reviews" ? "Held storefront orders" : tab}
      >
        {tab === "reviews" ? <OrderProtectionReviewQueue /> : tab === "attempts" ? <RiskAttemptsPanel /> : tab === "lists" ? <RiskListsPanel /> : tab === "accuracy" ? <RiskAccuracyPanel /> : <RiskSettingsPanel />}
      </motion.div>
    </div>
  );
}
