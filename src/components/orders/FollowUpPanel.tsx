import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, HourglassMedium, PhoneX, Question, Truck, type Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { FollowUpReasonKey } from "@/lib/orderStatusFilters";

const REASONS: { key: FollowUpReasonKey; label: string; hint: string; icon: Icon; tone: string; bar: string; activeTone: string }[] = [
  { key: "delivery_problem", label: "Delivery problem", hint: "Rider reported a problem", icon: PhoneX, tone: "text-rose-600 bg-rose-50", bar: "bg-rose-500", activeTone: "ring-rose-300 bg-rose-50/60" },
  { key: "no_movement", label: "No movement", hint: "Not picked up for 4+ days", icon: HourglassMedium, tone: "text-amber-600 bg-amber-50", bar: "bg-amber-500", activeTone: "ring-amber-300 bg-amber-50/60" },
  { key: "in_transit_long", label: "In transit too long", hint: "On the way for 5+ days", icon: Truck, tone: "text-indigo-600 bg-indigo-50", bar: "bg-indigo-500", activeTone: "ring-indigo-300 bg-indigo-50/60" },
  { key: "courier_unknown", label: "Steadfast doesn't know", hint: "Ask Steadfast support", icon: Question, tone: "text-zinc-600 bg-zinc-100", bar: "bg-zinc-400", activeTone: "ring-zinc-300 bg-zinc-50" },
];

/** Follow up lists the newest orders first, like the other tabs. */
export function sortFollowUpNewestFirst<T extends { created_at?: string | null }>(orders: T[]): T[] {
  const time = (order: T) => (order.created_at ? Date.parse(order.created_at) : 0);
  return [...orders].sort((a, b) => time(b) - time(a));
}

export type FollowUpPanelProps = {
  /** Parcels per reason, before the reason filter. */
  reasonCounts: Record<FollowUpReasonKey, number>;
  /** Parcels shown after the reason filter. */
  listCount: number;
  selectedCount: number;
  reasons: ReadonlySet<FollowUpReasonKey>;
  onToggleReason: (reason: FollowUpReasonKey) => void;
  onClearReasons: () => void;
  onMarkFollowedUp: (note: string) => Promise<void>;
};

// The Follow up tab's reason tiles (click to filter) and the "Mark followed up"
// action, which appears once parcels are ticked.
export function FollowUpPanel({
  reasonCounts, listCount, selectedCount, reasons, onToggleReason, onClearReasons, onMarkFollowedUp,
}: FollowUpPanelProps) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const hasReasonFilter = reasons.size > 0;
  const maxCount = Math.max(1, ...REASONS.map(({ key }) => reasonCounts[key]));

  const markFollowedUp = async () => {
    setSaving(true);
    try {
      await onMarkFollowedUp(note.trim());
      setNote("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2.5 border-b border-black/[0.07] bg-[#FAFAF8] px-3 py-3 sm:px-4">
      <div className="grid grid-cols-2 gap-2">
        {REASONS.map(({ key, label, hint, icon: ReasonIcon, tone, bar, activeTone }) => {
          const count = reasonCounts[key];
          const active = reasons.has(key);
          const share = Math.round((count / maxCount) * 100);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              data-testid={`follow-up-reason-${key}`}
              onClick={() => onToggleReason(key)}
              className={cn(
                "flex items-center gap-3 rounded-lg bg-white px-3 py-2 text-left ring-1 transition-all",
                active ? activeTone : "ring-black/[0.06] hover:ring-black/[0.14]",
                hasReasonFilter && !active && "opacity-55 hover:opacity-100",
                count === 0 && !active && "opacity-45",
              )}
            >
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", tone)}>
                <ReasonIcon weight="light" size={16} />
              </span>
              <span className="w-44 min-w-0 shrink-0">
                <span className="block truncate text-[12.5px] font-medium leading-tight text-black">{label}</span>
                <span className="block truncate text-[11px] leading-tight text-black/50">{hint}</span>
              </span>
              <span className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
                <motion.span
                  data-testid={`follow-up-bar-${key}`}
                  data-share={share}
                  className={cn("block h-full rounded-full", bar)}
                  initial={false}
                  animate={{ width: `${share}%` }}
                  transition={{ type: "spring", stiffness: 260, damping: 32 }}
                />
              </span>
              <span className="w-10 shrink-0 text-right text-lg font-light tabular-nums text-black">{count.toLocaleString("en-BD")}</span>
            </button>
          );
        })}
      </div>

      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-[12.5px] text-black/60">
          <span>{listCount.toLocaleString("en-BD")} {listCount === 1 ? "parcel" : "parcels"} · newest first</span>
          {hasReasonFilter && (
            <button type="button" onClick={onClearReasons} className="text-[12px] text-[#0262B8] underline-offset-2 hover:underline">
              Show all
            </button>
          )}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {selectedCount > 0 ? (
            <motion.div
              key="act"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="flex flex-1 items-center justify-end gap-2"
            >
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={300}
                placeholder="Add a note (optional): customer will receive tomorrow"
                className="h-9 w-full max-w-sm rounded-lg bg-white px-3 text-[12.5px] outline-none ring-1 ring-black/[0.1] focus:ring-black/30"
              />
              <button
                type="button"
                onClick={() => void markFollowedUp()}
                disabled={saving}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-black px-3.5 text-[12.5px] text-white hover:bg-black/85 disabled:opacity-50"
              >
                <CheckCircle weight="light" size={16} />
                {`Mark ${selectedCount} followed up`}
              </button>
            </motion.div>
          ) : (
            <motion.span key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[12px] text-black/45">
              Tick the parcels you called to mark them followed up. They come back in 2 days if nothing changes.
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
