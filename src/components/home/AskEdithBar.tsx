import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, Plus, Sparkle, Waveform } from "@phosphor-icons/react";

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
    <form
      onSubmit={submit}
      className="relative z-[2] mt-[34px] flex w-full max-w-[860px] items-center gap-3.5 rounded-[6px] border border-[#ECEAE4] bg-white px-[22px] py-[18px]"
    >
      <span aria-hidden="true" className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#FFD27A,#E0861B)] text-white">
        <Sparkle weight="light" size={16} />
      </span>
      <input
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="Ask Edith — “which orders are risky today?”"
        aria-label="Ask Edith"
        className="min-w-0 flex-1 bg-transparent text-[17px] text-[#111110] outline-none placeholder:text-[#8C8A84]"
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
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-[#55534E] transition-colors enabled:hover:bg-[#F2F1EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black data-[ready=true]:bg-[#111110] data-[ready=true]:text-white data-[ready=true]:hover:bg-black"
        data-ready={hasQuestion}
      >
        {hasQuestion ? <ArrowUp weight="light" size={18} /> : <Waveform weight="light" size={20} />}
      </button>
    </form>
  );
}
