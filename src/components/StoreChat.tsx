import { useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import LoadingState from "@/components/ui/loading-state";
import {
  ChatInput,
  ChatInputTextArea,
  ChatInputSubmit,
} from "@/components/ui/chat-input";

type Msg = { role: "user" | "assistant"; content: string };

async function streamStoreChat({
  messages,
  onDelta,
  onDone,
  onError,
  signal,
}: {
  messages: Msg[];
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
  signal?: AbortSignal;
}) {
  const resp = await apiFetch("/api/order-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model: "gpt-5.4-mini" }),
    signal,
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    onError(data.error || `Error ${resp.status}`);
    return;
  }
  if (!resp.body) {
    onError("No response body");
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;

  while (!done) {
    const { done: d, value } = await reader.read();
    if (d) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") {
        done = true;
        break;
      }
      try {
        const parsed = JSON.parse(json);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }
  onDone();
}

const SUGGESTIONS = [
  "How can I improve my storefront?",
  "Write a tagline for my store",
  "Suggest shipping zones for Bangladesh",
];

export default function StoreChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || isLoading) return;
    const userMsg: Msg = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m,
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamStoreChat({
        messages: [...messages, userMsg],
        onDelta: upsert,
        onDone: () => setIsLoading(false),
        onError: (err) => {
          upsert(`⚠️ ${err}`);
          setIsLoading(false);
        },
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setIsLoading(false);
        return;
      }
      upsert("⚠️ Failed to connect. Please try again.");
      setIsLoading(false);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setIsLoading(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[14px] border border-black/[0.08] bg-white">
      <div className="border-b border-black/[0.06] px-4 py-3">
        <p className="text-[13px] font-semibold text-black tracking-tight">
          Store Assistant
        </p>
        <p className="text-[11px] text-black/40 mt-0.5">
          Ask about your storefront, products, or orders.
        </p>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="grid gap-2 pt-2">
            {SUGGESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="rounded-lg bg-black/[0.03] px-3 py-2 text-left text-[12px] text-black/60 transition-colors hover:bg-black/[0.06]"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={
              msg.role === "user" ? "flex justify-end" : "flex justify-start"
            }
          >
            <div
              className={
                msg.role === "user"
                  ? "max-w-[85%] rounded-lg bg-black px-3 py-2 text-[12px] text-white"
                  : "max-w-[85%] rounded-lg border border-black/[0.08] bg-black/[0.02] px-3 py-2 text-[12px] text-black/75 whitespace-pre-wrap"
              }
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-lg border border-black/[0.08] bg-black/[0.02] px-3 py-2">
              <LoadingState label="Thinking" variant="Drive" />
            </div>
          </div>
        )}
      </div>

      <div className="p-3">
        <ChatInput
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onSubmit={() => send(input)}
          loading={isLoading}
          onStop={stop}
          className="bg-[#f2f2f2] border-[#f2f2f2]"
        >
          <ChatInputTextArea
            placeholder="Ask the store assistant..."
            className="bg-transparent"
          />
          <ChatInputSubmit />
        </ChatInput>
      </div>
    </div>
  );
}
