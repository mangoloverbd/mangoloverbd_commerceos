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
        <span aria-hidden="true" className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#FFD27A,#E0861B)] text-white shadow-[0_0_0_4px_rgba(255,210,122,0.25)]">
          <Sparkle weight="light" size={17} />
        </span>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask Edith — which orders are risky today?"
          aria-label="Ask Edith"
          className="min-w-0 flex-1 bg-transparent text-[17.5px] text-[#111110] outline-none placeholder:text-[#8C8A84]"
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
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-[#E9E8E3] text-white transition-[background-color,transform] duration-200 ease-out enabled:active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black data-[ready=true]:bg-[#111110] data-[ready=true]:hover:bg-black"
          data-ready={hasQuestion}
        >
          <ArrowUp weight="light" size={18} />
        </button>
      </form>
    </div>
  );
}
