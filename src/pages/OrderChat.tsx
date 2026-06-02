import { useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Paperclip, ChevronDown, Mic, ArrowUp, X, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import { LoadingBreadcrumb } from "@/components/ui/animated-loading-svg-text-shimmer";

type Msg = { role: "user" | "assistant"; content: string };
type UploadedFile = { name: string; type: string; content: string };

const openAIModels = [
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini" },
  { id: "gpt-5.4", label: "GPT-5.4" },
  { id: "gpt-5.5", label: "GPT-5.5" },
  { id: "gpt-5.4-nano", label: "GPT-5.4 nano" },
];

async function streamChat({
  messages,
  model,
  onDelta,
  onDone,
  onError,
}: {
  messages: Msg[];
  model: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}) {
  const resp = await apiFetch("/api/order-chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages, model }),
  });

  if (resp.status === 404) {
    onError("Chat backend is not active yet. Restart localhost so the new /api/order-chat route and .env are loaded.");
    return;
  }

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

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  const win = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition;
}

/** AI avatar: favicon with a spinning ring */
function AiAvatar({ isStreaming }: { isStreaming?: boolean }) {
  return (
    <div className="relative size-8 shrink-0 mt-0.5">
      {isStreaming && <Spinner className="absolute inset-0 m-auto text-black/45" />}
      {/* Favicon */}
      <div className="absolute inset-[3px] rounded-full bg-black/5 flex items-center justify-center overflow-hidden">
        <img src="/logo.png" alt="AI" className="size-4 object-contain" />
      </div>
    </div>
  );
}

export default function OrderChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(openAIModels[0].id);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const readFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const nextFiles = await Promise.all(
      Array.from(list).map(async (file) => {
        const canRead =
          file.type.startsWith("text/") ||
          /\.(csv|json|txt|md|tsv)$/i.test(file.name);
        const content = canRead ? await file.text().catch(() => "") : "";
        return { name: file.name, type: file.type || "file", content };
      })
    );
    setFiles((prev) => [...prev, ...nextFiles].slice(0, 5));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startVoiceInput = () => {
    const Recognition = getSpeechRecognition();
    if (!Recognition || isListening) return;
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) setInput((prev) => `${prev}${prev ? " " : ""}${transcript}`);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    setIsListening(true);
    recognition.start();
  };

  const buildPrompt = (text: string) => {
    if (!files.length) return text;
    const fileContext = files
      .map((file) => {
        const content = file.content.trim();
        return content
          ? `File: ${file.name}\n${content.slice(0, 6000)}`
          : `File attached: ${file.name} (${file.type})`;
      })
      .join("\n\n");
    return `${text}\n\nAttached files:\n${fileContext}`;
  };

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || isLoading) return;

    const userMsg: Msg = { role: "user", content: buildPrompt(msg) };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setFiles([]);
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
        model,
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


  const composer = (
    <div className="mx-auto w-full max-w-xl rounded-[18px] bg-white border border-black/[0.08] shadow-sm">
      <div>
        <div className="px-4 pt-3">
          <textarea
            value={input}
            disabled={isLoading}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(input);
              }
            }}
            placeholder="Send a message..."
            rows={1}
            className="min-h-[40px] w-full resize-none border-0 bg-transparent p-0 text-[15px] font-medium leading-relaxed text-foreground outline-none placeholder:text-black/35 disabled:opacity-60"
          />

          {files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {files.map((file, index) => (
                <span
                  key={`${file.name}-${index}`}
                  className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full bg-black/[0.035] px-2.5 py-1 text-xs text-foreground/75"
                >
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                    className="rounded-full p-0.5 text-black/35 hover:bg-black/10 hover:text-black"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => readFiles(event.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-foreground/75 transition-colors hover:bg-black/[0.055] hover:text-foreground"
            >
              <Paperclip className="h-3.5 w-3.5" />
              Files
            </button>

            <div className="relative">
              <select
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className="h-7 appearance-none rounded-full border-0 bg-transparent py-0 pl-2 pr-6 text-[13px] font-semibold text-foreground/75 outline-none transition-colors hover:bg-black/[0.055] hover:text-foreground"
              >
                {openAIModels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-black/45" />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={startVoiceInput}
              disabled={isLoading}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-50",
                isListening
                  ? "bg-red-100 text-red-600"
                  : "bg-black/[0.045] text-foreground/65 hover:bg-black/[0.075] hover:text-foreground"
              )}
              title="Voice input"
            >
              <Mic className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => send(input)}
              disabled={!input.trim() || isLoading}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.08] text-foreground/55 transition-all hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-black/[0.08] disabled:hover:text-foreground/55"
              title="Send"
            >
              {isLoading ? <Spinner size="sm" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );


  return (
    <div className="relative flex h-[calc(100vh-80px)] flex-col bg-transparent overflow-hidden">

      {/* Clear button */}
      {messages.length > 0 && (
        <button
          onClick={() => setMessages([])}
          className="absolute right-8 top-4 z-10 rounded-full bg-black/[0.04] px-3 py-1.5 text-sm font-medium text-foreground/55 transition-colors hover:bg-black/[0.07] hover:text-foreground"
        >
          Clear
        </button>
      )}

      {/* Empty State */}
      <AnimatePresence mode="wait">
        {messages.length === 0 && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-1 flex-col items-center justify-center px-6 pt-24 pb-12"
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.45, ease: "easeOut" }}
              className="w-full"
            >
              {composer}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="mt-5 mx-auto w-full max-w-xl grid gap-2 sm:grid-cols-2"
            >
              {quickQuestions.map((q, i) => (
                <motion.button
                  key={q}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.05 }}
                  onClick={() => send(q)}
                  className="group rounded-xl bg-white/55 px-3.5 py-2.5 text-left text-sm text-foreground/75 transition-all hover:bg-white"
                >
                  <span className="inline-block transition-transform group-hover:translate-x-0.5">{q}</span>
                </motion.button>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages — scrollable, fills remaining space */}
      {messages.length > 0 && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pt-16 pb-4">
          <div className="flex flex-col gap-6">
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
                      "flex w-full gap-3",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.role === "assistant" && <AiAvatar isStreaming={streaming} />}
                    <div className={cn(
                      "rounded-xl px-4 py-2 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "max-w-[75%] bg-white text-neutral-900 border-x-2 border-t-2 border-b-4 border-neutral-300 shadow-sm"
                        : "border border-black/10 bg-black/[0.025]"
                    )}>
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm max-w-none text-foreground/80 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_strong]:text-foreground [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_code]:bg-black/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                          {streaming && (
                            <span className="inline-block w-[2px] h-[1em] bg-black/50 ml-0.5 align-text-bottom rounded-full animate-[blink_0.85s_step-end_infinite]" />
                          )}
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
                className="flex gap-3"
              >
                <AiAvatar isStreaming />
                <div className="rounded-xl border border-black/10 bg-black/[0.025] px-4 py-2.5">
                  <LoadingBreadcrumb text="Thinking" />
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* Input — always pinned to bottom */}
      {messages.length > 0 && (
        <div className="shrink-0 pb-4 px-4 relative">
          <div className="absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-[#f3f3f3] to-transparent pointer-events-none" />
          {composer}
        </div>
      )}
    </div>
  );
}
