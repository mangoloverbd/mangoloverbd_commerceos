import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
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

  return (
    <div className="min-h-full space-y-6 bg-[#FAFAF8] p-1 max-md:p-2 lg:p-2">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.4 }}
        className="relative space-y-4"
      >
        <div className="mb-3 flex flex-col items-center text-center">
          <div>
            <h1 className="font-sf-display text-[22px] font-bold tracking-tight text-black">Order Protection</h1>
            <p className="mx-auto mt-1 max-w-2xl text-[13px] text-black/45">
              Review held orders and investigate checkout risk signals.
            </p>
          </div>
        </div>
      </motion.div>

      <div className="flex justify-center">
        <SegmentedControl
          aria-label="Order protection sections"
          className="bg-neutral-200"
          selectedKeys={new Set([tab])}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (next) setTab(next as OrderProtectionTab);
          }}
        >
          {tabs.map(([value, label]) => (
            <SegmentedControlItem key={value} id={value}>{label}</SegmentedControlItem>
          ))}
        </SegmentedControl>
      </div>

      <motion.div
        key={tab}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 0.1, duration: reduceMotion ? 0 : 0.4 }}
        id={`order-protection-panel-${tab}`}
        className="overflow-hidden rounded-2xl bg-white"
        role="region"
        aria-label={panelLabels[tab]}
        tabIndex={0}
      >
        {tab === "reviews" ? <OrderProtectionReviewQueue /> : tab === "attempts" ? <RiskAttemptsPanel /> : tab === "lists" ? <RiskListsPanel /> : tab === "accuracy" ? <RiskAccuracyPanel /> : <RiskSettingsPanel />}
      </motion.div>
    </div>
  );
}
