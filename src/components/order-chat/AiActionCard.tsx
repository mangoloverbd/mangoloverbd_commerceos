import { useState } from "react";
import { Check } from "@phosphor-icons/react";
import { PopButton } from "@/components/ui/pop-button";
import type { Recommendation } from "./useAiChatStream";

type Props = {
  tool: string;
  recommendation: Recommendation;
  alternatives: Recommendation[];
  status: "pending" | "applied" | "rejected";
  before?: unknown;
  after?: unknown;
  onApply: (args: Record<string, unknown>) => void;
  onReject: () => void;
};

function Meter({ signal, tone }: { signal: number; tone: string }) {
  const color = tone === "green" ? "bg-status-lime-text" : tone === "orange" ? "bg-status-yellow-text" : "bg-black/40";
  return (
    <span className="flex items-end gap-0.5">
      {[0, 1, 2].map((bar) => (
        <span key={bar} className="w-1 rounded-full transition-colors"
          style={{ height: 10, background: bar < signal ? undefined : "rgba(0,0,0,0.16)" }} >
          <span className={`block h-full w-full rounded-full ${bar < signal ? color : ""}`} />
        </span>
      ))}
    </span>
  );
}

export default function AiActionCard({ recommendation, alternatives, status, before, after, onApply, onReject }: Props) {
  const all = [recommendation, ...alternatives];
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const active = all[selected];
  const others = all.map((o, i) => ({ o, i })).filter(({ i }) => i !== selected);

  if (status === "applied") {
    return (
      <div className="flex w-full max-w-md items-center gap-3" style={{ animation: "pop-in 260ms cubic-bezier(0.23,1,0.32,1) both" }}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-status-lime-background px-2.5 py-1 text-[12.5px] font-medium text-status-lime-text">
          <span className="flex size-4 items-center justify-center rounded-full bg-status-lime-text text-white">
            <Check weight="light" className="h-3 w-3" />
          </span>
          Applied
        </span>
        <span className="text-[12px] text-black/60">
          {active.summary}
        </span>
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center rounded-full bg-black/[0.06] px-2.5 py-1 text-[12.5px] font-medium text-black/40">
        Rejected
      </span>
    );
  }

  return (
    <div className="w-full max-w-md overflow-hidden rounded-[14px] bg-white shadow-sm border border-black/[0.08]">
      <div className="p-3.5">
        <span className="text-[13px] font-semibold text-black">Want me to apply this?</span>
        <p key={active.key} className="mt-1.5 min-h-12 text-[13px] leading-relaxed text-black/60"
          style={{ animation: "fade-in 180ms ease-out both" }}>
          {active.summary}
        </p>
      </div>

      {alternatives.length > 0 && (
        <div className="grid transition-[grid-template-rows,opacity] duration-300"
          style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)" }}>
          <div className="overflow-hidden">
            <div className="border-t border-black/[0.06] bg-[#FAFAF8] px-2 py-2">
              <p className="px-1.5 pb-1 text-[11px] font-medium text-black/40">Other options</p>
              {others.map(({ o, i }) => (
                <button key={o.key} type="button"
                  onClick={() => setSelected(i)}
                  className="flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-left hover:bg-black/[0.04]">
                  <Meter signal={o.signal} tone={o.tone} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-black">{o.summary}</span>
                  <span className="shrink-0 text-[11px] text-black/40">{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] bg-[#FAFAF8] px-3.5 py-2">
        <span className="flex items-center gap-2">
          <Meter signal={active.signal} tone={active.tone} />
          <span className="text-[12.5px] font-medium text-black/60">{active.label}</span>
        </span>
        <span className="flex items-center gap-2">
          {alternatives.length > 0 && (
            <PopButton color="default" size="sm" aria-expanded={open}
              onClick={() => setOpen((c) => !c)} className="px-2.5 text-[12.5px]">
              Alternatives
            </PopButton>
          )}
          <PopButton color="default" size="sm" onClick={onReject} className="px-2.5 text-[12.5px]">
            Reject
          </PopButton>
          <PopButton color="blue" size="sm" onClick={() => onApply(active.args)} className="text-[12.5px]">
            {active.cta}
          </PopButton>
        </span>
      </div>
    </div>
  );
}
