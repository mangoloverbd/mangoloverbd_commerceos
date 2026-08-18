import { useState } from "react";
import { Check, CaretLeft, CaretRight, ArrowUp, X } from "@phosphor-icons/react";
import type { ClarifyQuestion } from "./useAiChatStream";

type Answer = { q: string; type: "radio" | "check"; options: string[]; selected: number[]; custom?: string };

type Props = {
  questions: ClarifyQuestion[];
  status: "pending" | "answered" | "collapsed";
  onSubmit: (answers: Answer[]) => void;
  onDismiss: () => void;
};

export default function AiClarifyCard({ questions, status, onSubmit, onDismiss }: Props) {
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});
  const [sent, setSent] = useState(status !== "pending");

  if (status === "answered" || sent) {
    return (
      <div className="flex w-full max-w-sm items-center gap-3" style={{ animation: "pop-in 260ms cubic-bezier(0.23,1,0.32,1) both" }}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-status-lime-background px-2.5 py-1 text-[12.5px] font-medium text-status-lime-text">
          <span className="flex size-4 items-center justify-center rounded-full bg-status-lime-text text-white">
            <Check weight="light" className="h-3 w-3" />
          </span>
          Answers sent
        </span>
      </div>
    );
  }

  const question = questions[qi];
  if (!question) return null;
  const last = qi === questions.length - 1;
  const selected = answers[qi] ?? [];
  const hasAnswer = selected.length > 0 || Boolean(custom[qi]?.trim());

  const toggle = (index: number) => {
    setAnswers((cur) => {
      const picked = cur[qi] ?? [];
      const next = question.type === "radio"
        ? [index]
        : picked.includes(index) ? picked.filter((i) => i !== index) : [...picked, index];
      return { ...cur, [qi]: next };
    });
    if (question.type === "radio") {
      setCustom((cur) => ({ ...cur, [qi]: "" }));
      window.setTimeout(() => {
        if (qi === questions.length - 1) {
          setSent(true);
          collectAndSubmit();
        } else setQi((c) => Math.min(questions.length - 1, c + 1));
      }, 480);
    }
  };

  const collectAndSubmit = () => {
    const out: Answer[] = questions.map((q, i) => ({
      q: q.q, type: q.type, options: q.options,
      selected: answers[i] ?? [], custom: custom[i] ?? "",
    }));
    onSubmit(out);
  };

  const reset = () => { setQi(0); setAnswers({}); setCustom({}); setSent(false); };

  return (
    <div className="flex w-full max-w-sm flex-col items-stretch">
      <div className="w-full overflow-hidden rounded-[14px] bg-white shadow-sm border border-black/[0.08]">
        <div key={qi} className="p-3.5" style={{ animation: "fade-up 350ms cubic-bezier(0.23,1,0.32,1) both" }}>
          <div className="flex items-start justify-between gap-3">
            <span className="text-[13px] font-medium text-black">{question.q}</span>
            <button type="button" aria-label="Dismiss" onClick={onDismiss}
              className="flex size-6 shrink-0 items-center justify-center rounded-[8px] text-black/40 hover:bg-black/[0.04] hover:text-black">
              <X weight="light" className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            {question.options.map((option, i) => {
              const on = selected.includes(i);
              return (
                <button key={option} type="button" aria-pressed={on} onClick={() => toggle(i)}
                  className="-mx-1.5 flex items-center gap-2 rounded-[10px] px-1.5 py-1 text-left hover:bg-black/[0.04]">
                  <span className={`flex size-4 shrink-0 items-center justify-center transition-colors ${question.type === "radio" ? "rounded-full" : "rounded-[5px]"} ${on ? "bg-black text-white" : "shadow-[inset_0_0_0_1.5px_rgba(0,0,0,0.16)] text-transparent"}`}>
                    {question.type === "radio" ? (
                      <span className="size-1.5 rounded-full bg-white" style={{ transform: on ? "scale(1)" : "scale(0)" }} />
                    ) : (
                      <Check weight="light" className="h-3 w-3" />
                    )}
                  </span>
                  <span className={`text-[13px] ${on ? "text-black" : "text-black/60"}`}>{option}</span>
                </button>
              );
            })}
            <label className="-mx-1.5 flex items-center gap-2 rounded-[10px] px-1.5 py-1 hover:bg-black/[0.04]">
              <span aria-hidden="true" className="size-4 shrink-0" />
              <input
                value={custom[qi] ?? ""}
                onChange={(e) => {
                  setCustom((c) => ({ ...c, [qi]: e.target.value }));
                  if (question.type === "radio") setAnswers((c) => ({ ...c, [qi]: [] }));
                }}
                placeholder="Type something…"
                aria-label="Custom answer"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-black outline-none placeholder:text-black/40"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-black/[0.06] bg-[#FAFAF8] px-3.5 py-2">
          <span className="flex items-center gap-2">
            <button type="button" aria-label="Previous" disabled={qi === 0}
              onClick={() => setQi((c) => Math.max(0, c - 1))}
              className="flex size-6 items-center justify-center rounded-[5px] text-black/40 enabled:hover:bg-black/[0.04] enabled:hover:text-black/60 disabled:opacity-35">
              <CaretLeft weight="light" className="h-3.5 w-3.5" />
            </button>
            <span className="flex items-center gap-1">
              {questions.map((_, i) => (
                <button key={i} type="button" aria-label={`Question ${i + 1}`} aria-current={i === qi ? "step" : undefined}
                  disabled={sent} onClick={() => setQi(i)} className="rounded-full"
                  style={i === qi ? { width: 9, height: 9, border: "2.5px solid var(--color-black)" }
                    : i < qi ? { width: 7, height: 7, background: "rgba(0,0,0,0.4)" }
                    : { width: 7, height: 7, border: "1.5px solid rgba(0,0,0,0.4)" }} />
              ))}
            </span>
            <button type="button" aria-label="Next" disabled={last}
              onClick={() => setQi((c) => Math.min(questions.length - 1, c + 1))}
              className="flex size-6 items-center justify-center rounded-[5px] text-black/40 enabled:hover:bg-black/[0.04] enabled:hover:text-black/60 disabled:opacity-35">
              <CaretRight weight="light" className="h-3.5 w-3.5" />
            </button>
          </span>
          <button type="button" aria-label={last ? "Send answers" : "Next question"} disabled={!hasAnswer}
            onClick={() => { if (last) { setSent(true); collectAndSubmit(); } else setQi((c) => c + 1); }}
            className="flex size-7 items-center justify-center rounded-[8px] transition-colors"
            style={{ background: hasAnswer ? "black" : "rgba(0,0,0,0.06)", color: hasAnswer ? "white" : "rgba(0,0,0,0.4)" }}>
            <ArrowUp weight="light" className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
