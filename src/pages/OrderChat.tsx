import { useState, useRef, useEffect, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { DownloadSimple } from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { ThinkingOrb } from "@/components/ui/thinking-orbs";
import { OrbErrorBoundary } from "@/components/ui/orb-error-boundary";
import OrderChatComposer, { type UploadedFile } from "@/components/OrderChatComposer";
import { useAiChatStream, type StreamEvent, type ClarifyQuestion, type Recommendation } from "@/components/order-chat/useAiChatStream";
import AiClarifyCard from "@/components/order-chat/AiClarifyCard";
import AiActionCard from "@/components/order-chat/AiActionCard";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/components/ui/sonner";

type BaseMsg = { role: "user" | "assistant"; content: string; image?: string; revisedPrompt?: string; model?: string; at?: number };
type ClarifyMsg = { role: "assistant"; kind: "clarify"; call_id: string; questions: ClarifyQuestion[]; status: "pending" | "answered" | "collapsed"; at?: number };
type ActionMsg = { role: "assistant"; kind: "action"; call_id: string; tool: string; recommendation: Recommendation; alternatives: Recommendation[]; status: "pending" | "applied" | "rejected"; before?: unknown; after?: unknown; at?: number };
type Msg = BaseMsg | ClarifyMsg | ActionMsg;

const openAIModels = [
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", tag: "Default" },
  { id: "gpt-5.4", label: "GPT-5.4" },
  { id: "gpt-5.5", label: "GPT-5.5", tag: "Flagship" },
  { id: "gpt-5.4-nano", label: "GPT-5.4 nano", tag: "Fast" },
];

function modelLabel(id?: string) {
  if (!id) return "Assistant";
  return openAIModels.find((m) => m.id === id)?.label ?? id;
}

function formatTime(at?: number) {
  if (!at) return "";
  return new Date(at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function Section({
  label,
  sub,
  time,
  children,
  resolving,
}: {
  label: string;
  sub: string;
  time: string;
  children: ReactNode;
  resolving?: boolean;
}) {
  return (
    <div
      className="flex w-full flex-col gap-1.5 transition-opacity duration-[400ms]"
      style={{
        opacity: resolving ? 0.7 : 1,
        transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
        animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) both",
      }}
    >
      <div className="flex items-center gap-1 text-[12px] leading-[1.3]">
        <span className="font-medium text-black">{label}</span>
        <span className="text-black/45">{sub}</span>
        {time && <span className="text-black/45">· {time}</span>}
      </div>
      {children}
    </div>
  );
}

function AgentWorking() {
  return (
    <OrbErrorBoundary
      fallback={
        <div className="inline-flex h-9 items-center gap-2 bg-transparent">
          <span className="relative flex size-8 items-center justify-center">
            <span className="absolute inline-flex size-8 animate-ping rounded-full bg-black/10 opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-black/30" />
          </span>
          <span className="whitespace-nowrap text-xs text-black/50">
            Agent working…
          </span>
        </div>
      }
    >
      <div className="inline-flex h-9 items-center gap-2 bg-transparent">
        <div style={{ width: 32, height: 32, overflow: "hidden" }}>
          <ThinkingOrb state="breathing" size={64} style={{ transform: "scale(0.5)", transformOrigin: "top left" }} />
        </div>
        <span className="whitespace-nowrap text-xs text-black/50">
          Agent working…
        </span>
      </div>
    </OrbErrorBoundary>
  );
}

export default function OrderChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState(openAIModels[0].id);
  const [imageMode, setImageMode] = useState(false);
  const [imageSize, setImageSize] = useState("auto");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendStream = useAiChatStream();
  const { role } = useUserRole();
  const isAdmin = role === "admin";

  const quickQuestions = [
    "How many orders are pending?",
    "Show orders sent to Steadfast",
    "What's the total revenue?",
    ...(isAdmin ? ["Add 50 stock to M size of Cocoa Brown Trouser"] : []),
    "Which orders have notes?",
  ];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const buildPrompt = (text: string, files: UploadedFile[]) => {
    if (!files.length) return text;
    const textFiles = files.filter((f) => !f.isImage);
    if (!textFiles.length) return text;
    const fileContext = textFiles
      .map((file) => {
        const content = file.content.trim();
        return content
          ? `File: ${file.name}\n${content.slice(0, 6000)}`
          : `File attached: ${file.name} (${file.type})`;
      })
      .join("\n\n");
    return `${text}\n\nAttached files:\n${fileContext}`;
  };

  const generateImage = async (text: string, files: UploadedFile[]) => {
    const msg = text.trim();
    if (!msg || isLoading) return;

    const imageFiles = files.filter((f) => f.isImage);
    const userMsg: Msg = {
      role: "user",
      content: msg,
      image: imageFiles[0]?.preview,
      at: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const body: Record<string, string> = {
        prompt: msg,
        size: imageSize,
        quality: "medium",
      };
      if (imageFiles[0]?.content) body.image = imageFiles[0].content;

      const resp = await apiFetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({
        error: `HTTP ${resp.status}`,
      }));
      if (!resp.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `⚠️ ${data.error || "Image generation failed"}`,
            model: "GPT Image 2",
            at: Date.now(),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Generated with GPT-5.5 and the image generation tool.",
            image: data.image,
            revisedPrompt: data.revisedPrompt,
            model: "GPT Image 2",
            at: Date.now(),
          },
        ]);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Network error";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ Failed to generate image: ${errMsg}`,
          model: "GPT Image 2",
          at: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const send = async (text: string, files: UploadedFile[]) => {
    const msg = text.trim();
    if (!msg || isLoading) return;
    if (imageMode) return generateImage(msg, files);

    const userMsg: Msg = { role: "user", content: buildPrompt(msg, files), at: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const baseMsgs = [...messages, userMsg].map((m) => ({ role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant", content: "content" in m ? m.content : "" }));

    await sendStream({
      messages: baseMsgs,
      model,
      signal: controller.signal,
      onEvent: (e: StreamEvent) => {
        if (e.type === "delta") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && !("kind" in last)) {
              return prev.map((m, i) => {
                if (i !== prev.length - 1) return m;
                const lm = m as BaseMsg;
                return { ...lm, content: (lm.content || "") + e.content };
              });
            }
            return [...prev, { role: "assistant", content: e.content, model, at: Date.now() }];
          });
        } else if (e.type === "question") {
          setMessages((prev) => [...prev, { role: "assistant", kind: "clarify", call_id: e.call_id, questions: e.questions, status: "pending", at: Date.now() }]);
        } else if (e.type === "action") {
          if (e.recommendation) {
            setMessages((prev) => [...prev, { role: "assistant", kind: "action", call_id: e.call_id, tool: e.tool, recommendation: e.recommendation, alternatives: e.alternatives, status: "pending", at: Date.now() }]);
          }
        }
      },
      onDone: () => setIsLoading(false),
      onError: (err) => {
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err}`, model, at: Date.now() }]);
        setIsLoading(false);
      },
    });
  };

  const stop = () => {
    abortRef.current?.abort();
    setIsLoading(false);
  };

  const handleApply = async (msg: ActionMsg, args: Record<string, unknown>) => {
    try {
      const res = await apiFetch("/api/order-chat/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: msg.call_id, tool: msg.tool, args }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((data as { error?: string }).error || "Failed to apply");
        return;
      }
      setMessages((prev) => prev.map((m) => {
        if (m === msg) {
          const a = m as ActionMsg;
          return { ...a, status: "applied" as const, before: (data as { before?: unknown }).before, after: (data as { after?: unknown }).after };
        }
        return m;
      }));
      const priorMsgs = messages.map((m) => ({ role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant", content: "content" in m ? m.content : "" }));
      await sendStream({
        messages: [...priorMsgs, { role: "user", content: `[Applied action ${msg.tool} with args ${JSON.stringify(args)}. Result: ${JSON.stringify((data as { after?: unknown }).after)}. Confirm in one short sentence.]` }],
        model,
        onEvent: (e) => {
          if (e.type === "delta") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant" && !("kind" in last)) {
                return prev.map((m, i) => {
                  if (i !== prev.length - 1) return m;
                  const lm = m as BaseMsg;
                  return { ...lm, content: (lm.content || "") + e.content };
                });
              }
              return [...prev, { role: "assistant", content: e.content, model, at: Date.now() }];
            });
          }
        },
        onDone: () => {},
        onError: () => {},
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply");
    }
  };

  const handleReject = (msg: ActionMsg) => {
    setMessages((prev) => prev.map((m) => {
      if (m === msg) {
        const a = m as ActionMsg;
        return { ...a, status: "rejected" as const };
      }
      return m;
    }));
  };

  const handleClarifyAnswer = async (msg: ClarifyMsg, answers: { q: string; type: "radio" | "check"; options: string[]; selected: number[]; custom?: string }[]) => {
    setMessages((prev) => prev.map((m) => {
      if (m === msg) {
        const c = m as ClarifyMsg;
        return { ...c, status: "answered" as const };
      }
      return m;
    }));
    const priorMsgs = messages.map((m) => ({ role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant", content: "content" in m ? m.content : "" }));
    setIsLoading(true);
    await sendStream({
      messages: priorMsgs,
      model,
      onEvent: (e: StreamEvent) => {
        if (e.type === "delta") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && !("kind" in last)) {
              return prev.map((m, i) => {
                if (i !== prev.length - 1) return m;
                const lm = m as BaseMsg;
                return { ...lm, content: (lm.content || "") + e.content };
              });
            }
            return [...prev, { role: "assistant", content: e.content, model, at: Date.now() }];
          });
        } else if (e.type === "question") {
          setMessages((prev) => [...prev, { role: "assistant", kind: "clarify", call_id: e.call_id, questions: e.questions, status: "pending", at: Date.now() }]);
        } else if (e.type === "action") {
          if (e.recommendation) {
            setMessages((prev) => [...prev, { role: "assistant", kind: "action", call_id: e.call_id, tool: e.tool, recommendation: e.recommendation, alternatives: e.alternatives, status: "pending", at: Date.now() }]);
          }
        }
      },
      onDone: () => setIsLoading(false),
      onError: (err) => { setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err}`, model, at: Date.now() }]); setIsLoading(false); },
    });
    void apiFetch("/api/order-chat/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: msg.call_id, answers, priorMessages: priorMsgs, model }),
    });
  };

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
              className="w-full max-w-xl"
            >
              <OrderChatComposer
                onSend={send}
                loading={isLoading}
                onStop={stop}
                models={openAIModels}
                model={model}
                onModelChange={setModel}
                imageMode={imageMode}
                onImageModeChange={setImageMode}
                imageSize={imageSize}
                onImageSizeChange={setImageSize}
                isAdmin={isAdmin}
              />
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
                  onClick={() => send(q, [])}
                  className="group rounded-xl bg-white/55 px-3.5 py-2.5 text-left text-sm text-foreground/75 transition-all hover:bg-white"
                >
                  <span className="inline-block transition-transform group-hover:translate-x-0.5">
                    {q}
                  </span>
                </motion.button>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      {messages.length > 0 && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pt-14 pb-4">
          <div className="mx-auto flex max-w-xl flex-col gap-2.5">
            {messages.map((msg, i) => {
              const isLastAssistant =
                msg.role === "assistant" && i === messages.length - 1;
              const resolving = isLastAssistant && isLoading;

              if ("kind" in msg && msg.kind === "clarify") {
                return (
                  <div key={i} className="flex justify-start">
                    <AiClarifyCard questions={msg.questions} status={msg.status}
                      onSubmit={(answers) => void handleClarifyAnswer(msg, answers)}
                      onDismiss={() => setMessages((prev) => prev.map((m) => {
                        if (m === msg) {
                          const c = m as ClarifyMsg;
                          return { ...c, status: "collapsed" as const };
                        }
                        return m;
                      }))} />
                  </div>
                );
              }
              if ("kind" in msg && msg.kind === "action") {
                return (
                  <div key={i} className="flex justify-start">
                    <AiActionCard tool={msg.tool} recommendation={msg.recommendation} alternatives={msg.alternatives}
                      status={msg.status} before={msg.before} after={msg.after}
                      onApply={(args) => void handleApply(msg, args)}
                      onReject={() => handleReject(msg)} />
                  </div>
                );
              }

              if (msg.role === "user") {
                return (
                  <div key={i} className="flex justify-end pl-14">
                    <div
                      className="max-w-full rounded-xl bg-black/[0.03] px-3 py-1.5 text-[13px] leading-[1.4] text-black"
                      style={{
                        animation:
                          "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both",
                      }}
                    >
                      {msg.content}
                      {msg.image && (
                        <img
                          src={msg.image}
                          alt="Uploaded"
                          className="mt-2 rounded-lg max-w-[200px] max-h-[150px] object-cover border border-black/10"
                        />
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <Section key={i} resolving={resolving}>
                  {resolving && (
                    <div className="mb-1">
                      <AgentWorking />
                    </div>
                  )}
                  <div className="prose prose-sm max-w-none text-[13px] leading-normal text-black/80 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_strong]:text-black [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_code]:bg-black/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                    {msg.image && (
                      <div className="mt-3 relative group inline-block">
                        <img
                          src={msg.image}
                          alt="Generated"
                          className="rounded-xl max-h-[500px] w-auto border border-black/10 block"
                        />
                        <a
                          href={msg.image}
                          download="generated-image.png"
                          className="absolute top-2 right-2 rounded-lg bg-black/70 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <DownloadSimple weight="light" className="h-4 w-4" />
                        </a>
                      </div>
                    )}
                    {msg.revisedPrompt && (
                      <p className="mt-2 text-[11px] text-black/40">
                        Revised prompt: {msg.revisedPrompt}
                      </p>
                    )}
                  </div>
                </Section>
              );
            })}

            {isLoading &&
              messages[messages.length - 1]?.role !== "assistant" && (
                <Section resolving>
                  <AgentWorking />
                </Section>
              )}
          </div>
        </div>
      )}

      {/* Input — pinned to bottom */}
      {messages.length > 0 && (
        <div className="shrink-0 pb-4 px-4 relative">
          <div className="absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-[#f3f3f3] to-transparent pointer-events-none" />
          <div className="mx-auto w-full max-w-xl">
            <OrderChatComposer
              onSend={send}
              loading={isLoading}
              onStop={stop}
              models={openAIModels}
              model={model}
              onModelChange={setModel}
              imageMode={imageMode}
              onImageModeChange={setImageMode}
              imageSize={imageSize}
              onImageSizeChange={setImageSize}
              isAdmin={isAdmin}
            />
          </div>
        </div>
      )}
    </div>
  );
}
