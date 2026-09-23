import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/base/segmented-control/segmented-control";
import type { OrderEditorTab } from "@/hooks/useOrderEditorTab";
import { cn } from "@/lib/utils";

const SLIDE_EASE = [0.32, 0.72, 0, 1] as const;

export function OrderEditorTabSwitch({
  value,
  onChange,
  className,
}: {
  value: OrderEditorTab;
  onChange: (tab: OrderEditorTab) => void;
  className?: string;
}) {
  const itemClass = ({ isSelected }: { isSelected: boolean }) => cn(
    "px-3 py-1.5 font-sans text-[13px]",
    isSelected ? "font-medium text-black" : "font-normal text-black/55 hover:text-black/80",
  );

  return (
    <SegmentedControl
      data-testid="order-editor-tab-switch"
      aria-label="Order editor view"
      selectedKeys={new Set([value])}
      onSelectionChange={(keys) => {
        const selected = [...keys][0];
        if (selected) onChange(String(selected) === "logs" ? "logs" : "details");
      }}
      thumbClassName="rounded-md border border-black/[0.08] bg-white shadow-sm"
      className={cn("shrink-0 rounded-lg bg-black/[0.055] p-1 ring-1 ring-black/[0.035]", className)}
    >
      <SegmentedControlItem id="details" className={itemClass}>Order details</SegmentedControlItem>
      <SegmentedControlItem id="logs" className={itemClass}>Logs</SegmentedControlItem>
    </SegmentedControl>
  );
}

export function OrderEditorTabPanels({
  tab,
  details,
  logs,
}: {
  tab: OrderEditorTab;
  details: ReactNode;
  logs: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const showLogs = tab === "logs";
  // Order details stays mounted so unsaved edits survive a trip to Logs.
  const [detailsExited, setDetailsExited] = useState(showLogs);

  useEffect(() => {
    if (!showLogs) setDetailsExited(false);
  }, [showLogs]);

  const transition = reduceMotion ? { duration: 0 } : { duration: 0.25, ease: SLIDE_EASE };

  return (
    <div data-testid="order-editor-tab-panels" className="relative min-h-0 overflow-hidden">
      <motion.div
        data-testid="order-editor-details-panel"
        aria-hidden={showLogs || undefined}
        initial={false}
        animate={showLogs ? { x: "-6%", opacity: 0 } : { x: 0, opacity: 1 }}
        transition={transition}
        onAnimationComplete={() => {
          if (showLogs) setDetailsExited(true);
        }}
        style={{ visibility: showLogs && detailsExited ? "hidden" : undefined }}
        className={cn(showLogs && "pointer-events-none absolute inset-x-0 top-0")}
      >
        {details}
      </motion.div>

      {showLogs && (
        <motion.div
          data-testid="order-editor-logs-panel"
          initial={reduceMotion ? false : { x: "6%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={transition}
        >
          {logs}
        </motion.div>
      )}
    </div>
  );
}
