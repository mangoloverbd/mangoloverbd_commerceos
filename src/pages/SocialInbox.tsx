import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import { AnimatedText } from "@/components/ui/animated-text";
import {
  FacebookLogo,
  InstagramLogo,
  WhatsappLogo,
  Robot,
  User,
  Image as PhImage,
  MagnifyingGlass,
  ArrowLeft,
} from "@phosphor-icons/react";

type Platform = "facebook" | "instagram" | "whatsapp";

interface Conversation {
  id: string;
  platform: Platform;
  contact_id: string;
  contact_name: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

interface Message {
  id: string;
  conversation_id: string;
  sender: "user" | "bot";
  content: string;
  image_url: string | null;
  message_type: string;
  created_at: string;
}

const PLATFORM_CONFIG: Record<Platform, { label: string; icon: React.ElementType; color: string; bg: string; chip: string }> = {
  facebook: { label: "Facebook", icon: FacebookLogo, color: "text-[#1877F2]", bg: "bg-[#1877F2]/10", chip: "bg-[#1877F2]/10 text-[#1877F2]" },
  instagram: { label: "Instagram", icon: InstagramLogo, color: "text-[#E1306C]", bg: "bg-[#E1306C]/10", chip: "bg-[#E1306C]/10 text-[#E1306C]" },
  whatsapp: { label: "WhatsApp", icon: WhatsappLogo, color: "text-[#25D366]", bg: "bg-[#25D366]/10", chip: "bg-[#25D366]/10 text-[#128C4A]" },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function Avatar({ name, platform }: { name: string; platform: Platform }) {
  const cfg = PLATFORM_CONFIG[platform];
  const Icon = cfg.icon;
  return (
    <div className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-semibold uppercase ring-1 ring-black/[0.04]", cfg.bg)}>
      <span className={cfg.color}>{name.slice(0, 2)}</span>
      <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06]">
        <Icon size={8} weight="fill" className={cfg.color} />
      </div>
    </div>
  );
}

interface Props { platform: Platform; }

export default function SocialInbox({ platform }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cfg = PLATFORM_CONFIG[platform];
  const Icon = cfg.icon;

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/social/conversations/${platform}`)
      .then((r) => r.json())
      .then((d) => setConversations(d.conversations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [platform]);

  useEffect(() => {
    if (!selectedId) return;
    setMsgLoading(true);
    apiFetch(`/api/social/messages/${selectedId}`)
      .then((r) => r.json())
      .then((d) => {
        setMessages(d.messages || []);
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c))
        );
      })
      .catch(() => {})
      .finally(() => setMsgLoading(false));
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filtered = conversations.filter((c) =>
    (c.contact_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.last_message || "").toLowerCase().includes(search.toLowerCase())
  );
  const selected = conversations.find((c) => c.id === selectedId);

  function selectConversation(id: string) {
    setSelectedId(id);
    setMobileView("chat");
  }

  return (
    <div className="flex h-[calc(100vh-82px)] overflow-hidden bg-[#FAFAF8] p-1 lg:p-2">
      {/* Conversation list */}
      <div className={cn(
        "flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-black/10 bg-white md:w-72 lg:w-80",
        mobileView === "chat" && "hidden md:flex"
      )}>
        {/* Header */}
        <div className="border-b border-black/10 px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", cfg.bg)}>
                <Icon size={15} weight="fill" className={cfg.color} />
              </span>
              <div>
                <AnimatedText as="p" className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">{cfg.label}</AnimatedText>
                <p className="text-[11px] text-muted-foreground">{filtered.length} conversations</p>
              </div>
            </div>
            <span className={cn("rounded-full px-2 py-1 text-[10px] font-semibold", cfg.chip)}>Live</span>
          </div>
          <div className="relative">
            <MagnifyingGlass size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="h-9 w-full rounded-xl border border-black/[0.08] bg-[#F8F8F6] pl-8 pr-3 text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-black/20"
              data-testid="input-search-conversations"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-0">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse border-b border-black/[0.06] px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-black/[0.06]" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 w-28 rounded bg-black/[0.06]" />
                      <div className="h-2 w-40 rounded bg-black/[0.04]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3">
              <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", cfg.bg)}>
                <Icon size={22} weight="fill" className={cfg.color} />
              </span>
              <p className="text-[12px] font-medium text-muted-foreground">No conversations yet</p>
            </div>
          ) : (
            filtered.map((conv) => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className={cn(
                  "group flex w-full items-center gap-3 border-b border-black/[0.06] px-4 py-3.5 text-left transition-colors hover:bg-black/[0.025]",
                  selectedId === conv.id && "bg-black/[0.045]"
                )}
                data-testid={`button-conversation-${conv.id}`}
              >
                <Avatar name={conv.contact_name || "?"} platform={platform} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] font-semibold text-foreground">{conv.contact_name || "Unknown"}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(conv.last_message_at)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{conv.last_message || "—"}</p>
                </div>
                {conv.unread_count > 0 && (
                  <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white", platform === "facebook" ? "bg-[#1877F2]" : platform === "instagram" ? "bg-[#E1306C]" : "bg-[#25D366]")}>
                    {conv.unread_count > 9 ? "9+" : conv.unread_count}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat panel */}
      <div className={cn(
        "ml-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-black/10 bg-white",
        mobileView === "list" && "hidden md:flex"
      )}>
        {!selectedId ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
            <span className={cn("flex h-16 w-16 items-center justify-center rounded-2xl", cfg.bg)}>
              <Icon size={32} weight="fill" className={cfg.color} />
            </span>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Select a conversation</p>
              <p className="mt-1 text-[12px] text-muted-foreground">Messages will appear here</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex h-[58px] shrink-0 items-center gap-3 border-b border-black/10 bg-white px-4">
              <button
                onClick={() => setMobileView("list")}
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground md:hidden"
              >
                <ArrowLeft size={14} />
              </button>
              {selected && <Avatar name={selected.contact_name || "?"} platform={platform} />}
              <div>
                <p className="text-[13px] font-semibold text-foreground">{selected?.contact_name || "Unknown"}</p>
                <p className={cn("flex items-center gap-1 text-[10px] font-medium", cfg.color)}>
                  <Robot size={9} />
                  AI bot active
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto bg-[#FAFAF8] px-4 py-4">
              {msgLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner className="text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-[12px] font-medium text-muted-foreground">No messages</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn("flex max-w-[78%] gap-2.5", msg.sender === "bot" ? "ml-auto flex-row-reverse" : "flex-row")}
                    >
                      <div className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl",
                        msg.sender === "bot" ? "bg-black" : cfg.bg
                      )}>
                        {msg.sender === "bot"
                          ? <Robot size={11} weight="fill" className="text-white" />
                          : <User size={11} weight="fill" className={cfg.color} />}
                      </div>
                      <div className={cn(
                        "rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed",
                        msg.sender === "bot"
                          ? "bg-black text-white"
                          : "border border-black/[0.08] bg-white text-foreground"
                      )}>
                        {msg.image_url && (
                          <div className="mb-1.5">
                            <img src={msg.image_url} alt="" className="max-w-[160px] rounded" />
                          </div>
                        )}
                        {!msg.image_url && msg.message_type === "image" && (
                          <span className="flex items-center gap-1 text-foreground"><PhImage size={11} /> Image</span>
                        )}
                        {msg.content}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Bot notice */}
            <div className="shrink-0 border-t border-black/10 bg-white px-4 py-3">
              <p className="text-center text-[10px] font-medium text-muted-foreground">
                AI bot responds automatically · Replies sent via {cfg.label} API
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
