import { useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { User, MessageCircle, TrendingUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { AIChatInput } from "@/components/ui/ai-chat-input";

type Msg = { role: "user" | "assistant"; content: string };

async function streamChat({
  messages,
  onDelta,
  onDone,
  onError,
}: {
  messages: Msg[];
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}) {
  const resp = await apiFetch("/api/order-chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
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
      if (json === "[DONE]") { done = true; break; }
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

const quickQuestions = [
  "How many orders are pending?",
  "Show orders sent to Steadfast",
  "What's the total revenue?",
  "Which orders have notes?",
];

/** AI avatar: favicon with a spinning ring */
function AiAvatar({ isStreaming }: { isStreaming?: boolean }) {
  return (
    <div className="relative size-8 shrink-0 mt-0.5">
      {/* Spinning ring */}
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-transparent border-t-black/40 border-r-black/10"
        animate={isStreaming ? { rotate: 360 } : { rotate: 0 }}
        transition={isStreaming ? { duration: 1.2, repeat: Infinity, ease: "linear" } : { duration: 0 }}
      />
      {/* Favicon */}
      <div className="absolute inset-[3px] rounded-full bg-black/5 flex items-center justify-center overflow-hidden">
        <img src="/favicon.svg" alt="AI" className="size-4 object-contain" />
      </div>
    </div>
  );
}

export default function OrderChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || isLoading) return;

    const userMsg: Msg = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamChat({
        messages: [...messages, userMsg],
        onDelta: upsert,
        onDone: () => setIsLoading(false),
        onError: (err) => {
          upsert(`⚠️ ${err}`);
          setIsLoading(false);
        },
      });
    } catch {
      upsert("⚠️ Failed to connect. Please try again.");
      setIsLoading(false);
    }
  };



  /** Check if the last message is an assistant message still streaming */
  const isAssistantStreaming = isLoading && messages.length > 0 && messages[messages.length - 1]?.role === "assistant";

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-[#1A1A1A] flex flex-col">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-black/5 bg-white/80 backdrop-blur-xl px-6 h-16 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-black flex items-center justify-center">
            <MessageCircle className="h-4 w-4 text-white" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-black">Order Assistant</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="text-[10px] font-bold uppercase tracking-wider text-black hover:text-black transition-colors"
          >
            Clear Chat
          </button>
        )}
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col max-w-[1800px] w-full mx-auto">
        {/* Empty State */}
        <AnimatePresence mode="wait">
          {messages.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex flex-col items-center justify-center px-6 py-16"
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/5 text-black text-[10px] font-bold uppercase tracking-wider mb-6"
              >
                <TrendingUp className="w-3 h-3" />
                AI-Powered Insights
              </motion.div>

              {/* Animated favicon hero */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05, type: "spring", stiffness: 200 }}
                className="relative mb-8"
              >
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-transparent border-t-black/20 border-r-black/5"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  style={{ width: 72, height: 72 }}
                />
                <div className="size-[72px] rounded-full bg-black/5 flex items-center justify-center">
                  <img src="/favicon.svg" alt="AI" className="size-8 object-contain" />
                </div>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-5xl lg:text-6xl font-normal leading-tight text-center"
              >
                Order <span className="italic text-black underline decoration-black/10 transition-colors hover:text-black">Assistant</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg text-black max-w-xl font-light text-center mt-4"
              >
                Ask anything about your orders — pending, confirmed, courier status, notes, fraud checks, and revenue.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 25 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="grid grid-cols-2 gap-3 mt-10 max-w-lg w-full"
              >
                {quickQuestions.map((q, i) => (
                  <motion.button
                    key={q}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.05 }}
                    onClick={() => send(q)}
                    className="text-left text-sm px-4 py-3 rounded-xl border border-black/5 bg-white hover:bg-black/[0.02] hover:border-black/10 transition-all text-black hover:text-black group"
                  >
                    <span className="group-hover:translate-x-0.5 inline-block transition-transform">{q}</span>
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        {messages.length > 0 && (
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-10 space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => {
                const isLastAssistant = msg.role === "assistant" && i === messages.length - 1;
                const streaming = isLastAssistant && isLoading;

                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={cn(
                      "flex gap-3 max-w-3xl",
                      msg.role === "user" ? "ml-auto flex-row-reverse" : ""
                    )}
                  >
                    {msg.role === "user" ? (
                      <div className="size-8 rounded-full bg-black flex items-center justify-center shrink-0 mt-0.5">
                        <User className="size-4 text-white" />
                      </div>
                    ) : (
                      <AiAvatar isStreaming={streaming} />
                    )}
                    <div className={cn(
                      "rounded-xl px-4 py-2 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-black text-white"
                        : "bg-white border border-black/5 shadow-sm"
                    )}>
                      {msg.role === "assistant" ? (
                        <div className={cn(
                          "prose prose-sm max-w-none text-[#1A1A1A]/80 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_strong]:text-[#1A1A1A] [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_code]:bg-black/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs",
                          streaming && "ai-typing"
                        )}>
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                          {streaming && <span className="inline-block w-[2px] h-4 bg-black/40 ml-0.5 align-text-bottom animate-pulse" />}
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 max-w-3xl"
              >
                <AiAvatar isStreaming />
                <div className="rounded-xl px-5 py-3 bg-white border border-black/5 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-black/20 animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-black/20 animate-pulse [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-black/20 animate-pulse [animation-delay:300ms]" />
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* Input Area */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: messages.length === 0 ? 0.5 : 0 }}
          className="bg-white/80 backdrop-blur-xl px-6 py-4 shrink-0"
        >
          <AIChatInput onSend={(msg) => send(msg)} disabled={isLoading} />
        </motion.div>
      </div>
    </div>
  );
}
