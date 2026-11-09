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
              "flex h-8 items-center justify-center gap-1.5 rounded-[10px] px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 max-md:flex-1",
              selected ? "bg-white text-black shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-black/50 hover:text-black",
            )}
          >
            {segment.label}
            <span
              className={cn(
                "min-w-5 rounded-full px-1.5 text-center text-[10.5px] leading-[18px] tabular-nums",
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
