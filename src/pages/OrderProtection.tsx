import { motion, useReducedMotion } from "framer-motion";
import { useState, type KeyboardEvent } from "react";
import { OrderProtectionReviewQueue } from "@/components/OrderProtectionReviewQueue";
import { RiskAccuracyPanel, RiskAttemptsPanel, RiskListsPanel, RiskSettingsPanel } from "@/components/risk/RiskDashboard";

const tabs = [
  ["reviews", "Reviews"],
  ["attempts", "Attempts"],
  ["lists", "Lists"],
  ["accuracy", "Accuracy"],
  ["settings", "Settings"],
] as const;

type OrderProtectionTab = typeof tabs[number][0];

const panelLabels: Record<OrderProtectionTab, string> = {
  reviews: "Held storefront orders",
  attempts: "Assessment history",
  lists: "Identity lists",
  accuracy: "Risk accuracy",
  settings: "Protection settings",
};

export default function OrderProtection() {
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<OrderProtectionTab>("reviews");

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    const nextTab = tabs[nextIndex][0];
    setTab(nextTab);
    document.getElementById(`order-protection-tab-${nextTab}`)?.focus();
  }

  return (
    <div className="min-h-full space-y-6 bg-[#FAFAF8] p-1 max-md:p-2 lg:p-2">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.4 }}
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
        {tabs.map(([value, label], index) => (
          <button
            key={value}
            id={`order-protection-tab-${value}`}
            type="button"
            role="tab"
            aria-selected={tab === value}
            aria-controls={`order-protection-panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            className={`pb-3 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-black ${tab === value ? "border-b border-black text-black" : "text-black/50 hover:text-black"}`}
            onClick={() => setTab(value)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            {label}
          </button>
        ))}
      </div>

      <motion.div
        key={tab}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 0.1, duration: reduceMotion ? 0 : 0.4 }}
        id={`order-protection-panel-${tab}`}
        className="overflow-hidden rounded-2xl bg-white"
        role="tabpanel"
        aria-labelledby={`order-protection-tab-${tab}`}
        aria-label={panelLabels[tab]}
        tabIndex={0}
      >
        {tab === "reviews" ? <OrderProtectionReviewQueue /> : tab === "attempts" ? <RiskAttemptsPanel /> : tab === "lists" ? <RiskListsPanel /> : tab === "accuracy" ? <RiskAccuracyPanel /> : <RiskSettingsPanel />}
      </motion.div>
    </div>
  );
}
