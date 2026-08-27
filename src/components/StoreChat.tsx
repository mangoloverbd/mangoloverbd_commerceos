import { useState, useRef, useEffect } from "react";
import { Plus, Clock } from "@phosphor-icons/react";
import { apiFetch, getAppConfig } from "@/lib/api";
import { AgentThinking } from "@/components/application/agent-thinking/agent-thinking";
import { StreamingMarkdown } from "@/components/order-chat/StreamingMarkdown";
import OrderChatComposer from "@/components/OrderChatComposer";

type Msg = { role: "user" | "assistant"; content: string; scope?: string; at?: number };

const TABS = ["Storefront"] as const;
type Tab = (typeof TABS)[number];

const PLACEHOLDERS: Record<Tab, string> = {
  Storefront: "Ask about your storefront...",
};

const SUGGESTIONS = [
  "How can I improve my storefront?",
  "Write a tagline for my store",
  "Suggest shipping zones for Bangladesh",
];

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

// Single-entry list for any AI_PROVIDER=compatible gateway. Reflects the
// AI_MODEL value reported by /api/config.
function compatibleModelFromConfig(defaultModelId: string) {
  const id = defaultModelId || "custom";
  return [{ id, label: id, tag: "Default" }];
}

// Resolve the default chat model + model list from /api/config so the
// composer shows models that actually exist on the configured provider.
// (OpenAI's gpt-5.4-mini isn't valid on OpenRouter or GMI Cloud, etc.)
let resolvedStoreChatConfig: { model: string; models: { id: string; label: string; tag?: string }[] } | null = null;
async function resolveStoreChatConfig(): Promise<{ model: string; models: { id: string; label: string; tag?: string }[] }> {
  if (resolvedStoreChatConfig) return resolvedStoreChatConfig;
  const cfg = await getAppConfig();
  const provider = cfg.aiProvider || "openai";
  let models;
  let defaultId;
  if (provider === "openrouter") {
    models = openRouterModels;
    defaultId = cfg.aiDefaultModel || openRouterModels[0].id;
  } else if (provider === "compatible") {
    models = compatibleModelFromConfig(cfg.aiDefaultModel || "");
    defaultId = models[0].id;
  } else {
    models = openAIModels;
    defaultId = openAIModels[0].id;
  }
  resolvedStoreChatConfig = { model: defaultId, models };
  return resolvedStoreChatConfig;
}

async function streamStoreChat({
  messages,
  model,
  onDelta,
  onDone,
  onError,
  signal,
}: {
  messages: Msg[];
  model?: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
  signal?: AbortSignal;
}) {
  const resp = await apiFetch("/api/order-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model: model || (await resolveStoreChatConfig()).model }),
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
        const content = parsed.delta?.content ?? parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }
  onDone();
}

function Section({
  children,
  resolving,
}: {
  children: React.ReactNode;
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
      {children}
    </div>
  );
}

function AgentWorking() {
  return <AgentThinking variant="stars" />;
}

export default function StoreChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("Storefront");
  const [model, setModel] = useState(openAIModels[0].id);
  const [models, setModels] = useState<{ id: string; label: string; tag?: string }[]>(openAIModels);
  const [imageMode, setImageMode] = useState(false);
  const [imageSize, setImageSize] = useState("auto");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Default the composer's model + list to the org's configured provider.
  useEffect(() => {
    let active = true;
    void resolveStoreChatConfig().then((cfg) => {
      if (!active) return;
      setModels(cfg.models);
      setModel(cfg.model);
    });
    return () => {
      active = false;
    };
  }, []);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || isLoading) return;
    const userMsg: Msg = { role: "user", content: msg, scope: tab, at: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
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
        return [...prev, { role: "assistant", content: assistantSoFar, scope: tab, at: Date.now() }];
      });
    };

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamStoreChat({
        messages: [...messages, userMsg],
        model,
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

  const reset = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages([]);
  };

  const scrollToLatest = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  };

  return (
    <div className="flex h-full w-full flex-col self-start overflow-hidden rounded-[14px] bg-white shadow-swiss">
      {/* header — tabs + actions */}
      <div className="flex shrink-0 items-center justify-between border-b border-black/[0.08] p-1.5">
        <div className="flex items-center">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={tab === item}
              onClick={() => setTab(item)}
              className={`rounded-[6px] px-2 py-[3px] text-[13px] text-black transition-[background-color,opacity] duration-100 ${
                tab === item ? "bg-yellow-300" : "opacity-50 hover:opacity-75"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="New conversation"
            onClick={reset}
            className="flex size-6 items-center justify-center rounded-[6px] text-black/45 transition-colors duration-100 hover:bg-black/[0.06] hover:text-black/60"
          >
            <Plus weight="light" size={15} />
          </button>
          <button
            type="button"
            aria-label="Jump to latest"
            onClick={scrollToLatest}
            className="flex size-6 items-center justify-center rounded-[6px] text-black/45 transition-colors duration-100 hover:bg-black/[0.06] hover:text-black/60"
          >
            <Clock weight="light" size={15} />
          </button>
        </div>
      </div>

      {/* conversation */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-3">
        {messages.length === 0 && (
          <div className="grid gap-2 pt-1">
            {SUGGESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="rounded-[8px] bg-black/[0.03] px-3 py-2 text-left text-[12px] text-black/60 transition-colors hover:bg-black/[0.06]"
                style={{ animation: "fade-up 400ms cubic-bezier(0.23,1,0.32,1) both" }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <div key={i} className="flex justify-end pl-14">
                <div
                  className="rounded-xl bg-black/[0.03] px-3 py-1.5 text-[13px] leading-[1.4] text-black"
                  style={{ animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }}
                >
                  {msg.content}
                </div>
              </div>
            );
          }
          const isLastAssistant = i === messages.length - 1;
          const resolving = isLoading && isLastAssistant;
          return (
            <Section key={i} resolving={resolving}>
              {resolving && !msg.content && (
                <div className="mb-1">
                  <AgentWorking />
                </div>
              )}
              {msg.content && (
                <div className="prose prose-sm max-w-none text-[13px] leading-normal text-black/80 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_strong]:text-black [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_code]:bg-black/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs">
                  <StreamingMarkdown content={msg.content} animate={isLastAssistant} />
                </div>
              )}
            </Section>
          );
        })}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <Section resolving>
            <AgentWorking />
          </Section>
        )}
      </div>

      {/* composer */}
      <div className="mt-auto shrink-0 p-1.5">
        <OrderChatComposer
          onSend={(text) => send(text)}
          loading={isLoading}
          onStop={stop}
          models={models}
          model={model}
          onModelChange={setModel}
          imageMode={imageMode}
          onImageModeChange={setImageMode}
          imageSize={imageSize}
          onImageSizeChange={setImageSize}
          placeholder={PLACEHOLDERS[tab]}
        />
      </div>
    </div>
  );
}
