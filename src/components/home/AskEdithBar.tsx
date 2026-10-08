import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, Plus, Sparkle } from "@phosphor-icons/react";

// Hands the question to the Ask Edith page, which sends it once its model is ready.
export function AskEdithBar() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const hasQuestion = question.trim().length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!hasQuestion) return;
    navigate("/order-chat", { state: { prompt: question.trim() } });
  };

  return (
    // Mango glow: a hairline mango-gradient edge with a warm glow that deepens on focus.
    <div className="relative z-[2] mt-[34px] w-full max-w-[860px] rounded-full bg-[linear-gradient(100deg,rgba(255,210,122,0.9),rgba(224,134,27,0.55)_40%,#E2E0DA_70%)] p-[1.5px] shadow-[0_14px_34px_-16px_rgba(224,134,27,0.35)] transition-shadow duration-300 ease-out focus-within:shadow-[0_16px_40px_-14px_rgba(224,134,27,0.5)]">
      <form onSubmit={submit} className="flex items-center gap-3.5 rounded-full bg-white py-2.5 pl-3 pr-2.5">
        {/* Beveled mango badge, raised on hover. */}
        <span
          aria-hidden="true"
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-[#B8650F] bg-[linear-gradient(to_top,#E0861B_0%,#FFD27A_80%,#FFE3A6_100%)] text-white transition-shadow duration-200 ease-out hover:shadow-[0_4px_3px_1px_#FCFCFC,0_6px_8px_#D6D7D9,0_-4px_4px_#CECFD1,0_-6px_4px_#FEFEFE,inset_0_0_3px_3px_#F2B85B]"
        >
          <Sparkle weight="light" size={17} className="drop-shadow-[0_1px_0_rgba(140,70,5,0.45)]" />
        </span>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask Edith — which orders are risky today?"
          aria-label="Ask Edith"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-[#111110] outline-none placeholder:text-[#8C8A84]"
        />
        <button
          type="button"
          onClick={() => navigate("/order-chat")}
          title="Open Ask Edith"
          aria-label="Open Ask Edith"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-[#55534E] transition-colors hover:bg-[#F2F1EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
        >
          <Plus weight="light" size={20} />
        </button>
        <button
          type="submit"
          disabled={!hasQuestion}
          title={hasQuestion ? "Ask" : "Type a question"}
          aria-label="Ask"
          // The Edith badge's bevel in black: faded until there's a question,
          // raised on hover, pressed in on click or keyboard focus.
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-black bg-[linear-gradient(to_top,#000_0%,#1F1F1E_80%,#3A3A38_100%)] text-white transition-[box-shadow,opacity] duration-200 ease-out disabled:opacity-40 enabled:hover:shadow-[0_4px_3px_1px_#FCFCFC,0_6px_8px_#D6D7D9,0_-4px_4px_#CECFD1,0_-6px_4px_#FEFEFE,inset_0_0_3px_3px_#2C2C2A] enabled:active:shadow-[0_4px_3px_1px_#FCFCFC,0_6px_8px_#D6D7D9,0_-4px_4px_#CECFD1,0_-6px_4px_#FEFEFE,inset_0_0_5px_3px_#000,inset_0_0_30px_#000] focus-visible:outline-none focus-visible:shadow-[0_4px_3px_1px_#FCFCFC,0_6px_8px_#D6D7D9,0_-4px_4px_#CECFD1,0_-6px_4px_#FEFEFE,inset_0_0_5px_3px_#000,inset_0_0_30px_#000]"
        >
          <ArrowUp weight="light" size={18} className="drop-shadow-[0_1px_0_rgba(0,0,0,0.6)]" />
        </button>
      </form>
    </div>
  );
}
