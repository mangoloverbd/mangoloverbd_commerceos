import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type AbandonedView = "active" | "dismissed";

type AbandonedViewToggleProps = {
  value: AbandonedView;
  onChange: (view: AbandonedView) => void;
  activeCount: number;
  /** Null while the dismissed list has not loaded yet. */
  dismissedCount: number | null;
};

const SEGMENTS: { value: AbandonedView; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "dismissed", label: "Dismissed" },
];

/** Active | Dismissed switch for the Incomplete tab; counts follow the current search. */
export function AbandonedViewToggle({ value, onChange, activeCount, dismissedCount }: AbandonedViewToggleProps) {
  const reduceMotion = useReducedMotion();
  return (
    <div
      role="radiogroup"
      aria-label="Checkout list"
      data-testid="abandoned-view-toggle"
      className="inline-flex h-9 items-center gap-0.5 rounded-xl bg-black/[0.06] p-0.5 max-md:w-full"
    >
      {SEGMENTS.map((segment) => {
        const selected = segment.value === value;
        const count = segment.value === "active" ? activeCount : dismissedCount;
        return (
          <button
            key={segment.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(segment.value)}
            className={cn(
              "relative flex h-8 items-center justify-center gap-1.5 rounded-[10px] px-3 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 max-md:flex-1",
              selected ? "text-black" : "text-black/50 hover:text-black",
            )}
          >
            {/* One white pill that slides to the selected segment. */}
            {selected && (
              <motion.span
                layoutId="abandoned-view-pill"
                aria-hidden
                className="absolute inset-0 rounded-[10px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40, mass: 0.8 }}
              />
            )}
            <span className="relative">{segment.label}</span>
            <span
              className={cn(
                "relative min-w-5 rounded-full px-1.5 text-center text-[10.5px] leading-[18px] tabular-nums transition-colors duration-200",
                selected ? "bg-black text-white" : "bg-black/[0.06] text-black/50",
              )}
            >
              {count === null ? "–" : count >= 200 && segment.value === "dismissed" ? "200+" : count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
