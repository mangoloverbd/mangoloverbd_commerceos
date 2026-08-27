import { useState, useRef, useEffect, type ReactNode } from "react";
import { apiFetch, getAppConfig } from "@/lib/api";
import { DownloadSimple } from "@phosphor-icons/react";
import { motion, LayoutGroup } from "framer-motion";
import { AgentThinking } from "@/components/application/agent-thinking/agent-thinking";
import OrderChatComposer, { type UploadedFile } from "@/components/OrderChatComposer";
import { useAiChatStream, type StreamEvent, type ClarifyQuestion, type Recommendation } from "@/components/order-chat/useAiChatStream";
import AiClarifyCard from "@/components/order-chat/AiClarifyCard";
import AiActionCard from "@/components/order-chat/AiActionCard";
import OrderChatHistory, { type Conversation } from "@/components/order-chat/OrderChatHistory";
import { StreamingMarkdown } from "@/components/order-chat/StreamingMarkdown";
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
  { id: "gpt-4o-mini", label: "GPT-4o mini", tag: "High limit" },
];

const openRouterModels = [
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra 550B", tag: "Default" },
  { id: "dots-studio/dots-3-note-preview:free", label: "Dots 3 Note Preview" },
];

// Models for any AI_PROVIDER=compatible gateway (e.g. GMI Cloud). The
// `id` is whatever AI_MODEL resolves to in /api/config — typically a slug
// the gateway exposes. The list is rendered as a single entry so the
// composer's model picker reflects the actual configured model rather
// than a hard-coded OpenAI one.
function compatibleModelFromConfig(defaultModelId: string) {
  const id = defaultModelId || "custom";
  return [{ id, label: id, tag: "Default" }];
}

const allChatModels = [...openAIModels, ...openRouterModels];

function modelLabel(id?: string) {
  if (!id) return "Assistant";
  return allChatModels.find((m) => m.id === id)?.label ?? id;
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
  return <AgentThinking variant="stars" />;
}

export default function OrderChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [liveMode, setLiveMode] = useState(true);
  const [aiProvider, setAiProvider] = useState<string>("openai");
  const [model, setModel] = useState(openAIModels[0].id);
  const [chatModels, setChatModels] = useState(openAIModels);

  // Default the chat model to the configured provider's default once /api/config
  // is available. For OpenAI we keep the curated list; for OpenRouter we show
  // the OpenRouter list with the configured default; for any compatible gateway
  // (e.g. GMI Cloud) we show a single entry reflecting AI_MODEL.
  useEffect(() => {
    let active = true;
    getAppConfig().then((cfg) => {
      if (!active) return;
      const provider = cfg.aiProvider || "openai";
      setAiProvider(provider);
      if (provider === "openrouter") {
        setChatModels(openRouterModels);
        if (cfg.aiDefaultModel) setModel(cfg.aiDefaultModel);
      } else if (provider === "compatible") {
        const list = compatibleModelFromConfig(cfg.aiDefaultModel || "");
        setChatModels(list);
        if (list[0]) setModel(list[0].id);
      } else {
        setChatModels(openAIModels);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  const [imageMode, setImageMode] = useState(false);
  const [imageSize, setImageSize] = useState("auto");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendStream = useAiChatStream();
  const { role } = useUserRole();
  const isAdmin = role === "admin";

  // Static quick-questions: no dependency on async role/products, so they
  // render correctly on the first paint and never swap/flicker.
  const quickQuestions = [
    "How many orders are pending?",
    "Show orders sent to Steadfast",
    "What's the total revenue?",
    "Add stock to a product variant",
    "Which products are running low on stock?",
    "Which orders have notes?",
  ];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Autosave the active conversation to history (debounced) once it has messages.
  useEffect(() => {
    if (!conversationId || messages.length === 0 || isLoading) return;
    const handle = setTimeout(() => {
      const firstUser = messages.find((m) => m.role === "user");
      const title =
        firstUser && "content" in firstUser ? String(firstUser.content).slice(0, 200) : "New chat";
      void apiFetch("/api/order-chat/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: conversationId, title, messages }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(handle);
  }, [messages, conversationId, isLoading]);

  const openConversation = async (c: Conversation) => {
    try {
      const res = await apiFetch(`/api/order-chat/history/${c.id}`);
      const data = await res.json();
      const conv = (data as { conversation?: Conversation & { messages?: Msg[] } }).conversation;
      if (!conv) return;
      setMessages((conv.messages || []) as Msg[]);
      setConversationId(conv.id);
      setHistoryOpen(false);
      setLiveMode(false);
    } catch {
      toast.error("Failed to load conversation");
    }
  };

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
    if (!msg) return;
    if (isLoading) stop();

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
    if (!msg) return;
    if (isLoading) stop();
    if (imageMode) return generateImage(msg, files);

    const userMsg: Msg = { role: "user", content: buildPrompt(msg, files), at: Date.now() };
    const convId = conversationId ?? crypto.randomUUID();
    if (!conversationId) setConversationId(convId);
    setLiveMode(true);
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
    setLiveMode(true);
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
    setLiveMode(true);
    setIsLoading(true);
    await sendStream({
      messages: priorMsgs,
      model,
      endpoint: "/api/order-chat/answer",
      bodyExtra: { call_id: msg.call_id, answers, priorMessages: priorMsgs },
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
  };

  const hasMessages = messages.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative flex h-[calc(100vh-80px)] flex-col bg-transparent overflow-hidden"
    >
      <LayoutGroup>
      {/* History + Clear */}
      <div className="absolute right-8 top-4 z-10 flex items-center gap-2">
        <button
          onClick={() => setHistoryOpen((o) => !o)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            historyOpen
              ? "bg-black/[0.07] text-foreground"
              : "bg-black/[0.04] text-foreground/55 hover:bg-black/[0.07] hover:text-foreground"
          }`}
        >
          History
        </button>
        {messages.length > 0 && (
          <button
            onClick={() => {
              setMessages([]);
              setConversationId(null);
            }}
            className="rounded-full bg-black/[0.04] px-3 py-1.5 text-sm font-medium text-foreground/55 transition-colors hover:bg-black/[0.07] hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      <OrderChatHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={openConversation}
        isAdmin={isAdmin}
      />

      {/* Messages (fade in) */}
      {hasMessages && (
        <motion.div
          key="messages"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 pt-14 pb-4"
        >
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
                    <StreamingMarkdown content={msg.content} animate={isLastAssistant && liveMode} />
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
        </motion.div>
      )}

      {/* Composer — single instance; glides between centered (empty) and pinned bottom */}
      <div
        className={
          hasMessages
            ? "shrink-0 pb-4 px-4 relative"
            : "flex flex-1 flex-col items-center justify-center px-6 pt-24 pb-12"
        }
      >
        {hasMessages && (
          <div className="absolute -top-5 left-0 right-0 h-5 bg-gradient-to-t from-[#f3f3f3]/70 to-transparent pointer-events-none" />
        )}
        {/* Only the composer box carries the layout animation. Its size is
            identical in both states, so `layout="position"` animates a pure
            translation (center → bottom) with no content scaling/flicker. */}
        <motion.div
          layout="position"
          transition={{ layout: { duration: 0.45, ease: [0.23, 1, 0.32, 1] } }}
          className="mx-auto w-full max-w-xl"
        >
          <OrderChatComposer
            onSend={send}
            loading={isLoading}
            onStop={stop}
            models={chatModels}
            model={model}
            onModelChange={setModel}
            imageMode={imageMode}
            onImageModeChange={setImageMode}
            imageSize={imageSize}
            onImageSizeChange={setImageSize}
            isAdmin={isAdmin}
          />
        </motion.div>

        {/* Quick questions: rendered statically so they're visible immediately
            on load. Stable positional keys (not the text) mean the admin slots
            update in place when role/products resolve instead of re-mounting
            and re-animating — which was the load-time flicker. They unmount
            instantly on send so they never hold layout space mid-transition. */}
        {!hasMessages && (
          <div className="mx-auto mt-5 w-full max-w-xl grid gap-2 sm:grid-cols-2">
            {quickQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => send(q, [])}
                className="group flex items-center rounded-xl bg-white/55 px-3.5 py-2 text-left text-[13px] text-foreground/75 transition-all hover:bg-white"
              >
                <span className="block w-full truncate transition-transform group-hover:translate-x-0.5">
                  {q}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      </LayoutGroup>
    </motion.div>
  );
}
