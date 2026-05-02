import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
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

const PLATFORM_CONFIG: Record<Platform, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  facebook: { label: "Facebook", icon: FacebookLogo, color: "text-[#1877F2]", bg: "bg-[#1877F2]/10" },
  instagram: { label: "Instagram", icon: InstagramLogo, color: "text-[#E1306C]", bg: "bg-[#E1306C]/10" },
  whatsapp: { label: "WhatsApp", icon: WhatsappLogo, color: "text-[#25D366]", bg: "bg-[#25D366]/10" },
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
    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-semibold uppercase shrink-0 relative", cfg.bg)}>
      <span className={cfg.color}>{name.slice(0, 2)}</span>
      <div className={cn("absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center bg-white shadow")}>
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
    <div className="flex h-[calc(100vh-0px)] bg-[#FAFAF8] overflow-hidden">
      {/* Conversation list */}
      <div className={cn(
        "w-full md:w-72 lg:w-80 border-r border-black/[0.06] flex flex-col bg-white shrink-0",
        mobileView === "chat" && "hidden md:flex"
      )}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-black/[0.05]">
          <div className="flex items-center gap-2.5 mb-3">
            <Icon size={16} weight="fill" className={cfg.color} />
            <span className="text-[8px] font-medium tracking-[0.3em] text-black uppercase">{cfg.label} Inbox</span>
          </div>
          <div className="relative">
            <MagnifyingGlass size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-black" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full h-8 pl-8 pr-3 bg-black/[0.03] border border-black/[0.06] text-[11px] text-black placeholder:text-black outline-none focus:border-black/15 transition-colors"
              data-testid="input-search-conversations"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-0">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="px-5 py-3.5 border-b border-black/[0.04] animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-black/[0.06]" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 w-28 bg-black/[0.06] rounded" />
                      <div className="h-2 w-40 bg-black/[0.04] rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Icon size={28} weight="light" className="text-black" />
              <p className="text-[10px] text-black tracking-[0.15em] uppercase">No conversations yet</p>
            </div>
          ) : (
            filtered.map((conv) => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-5 py-3.5 border-b border-black/[0.04] text-left hover:bg-black/[0.015] transition-colors",
                  selectedId === conv.id && "bg-black/[0.025]"
                )}
                data-testid={`button-conversation-${conv.id}`}
              >
                <Avatar name={conv.contact_name || "?"} platform={platform} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-medium text-black truncate">{conv.contact_name || "Unknown"}</span>
                    <span className="text-[9px] text-black shrink-0">{formatTime(conv.last_message_at)}</span>
                  </div>
                  <p className="text-[10px] text-black truncate mt-0.5">{conv.last_message || "—"}</p>
                </div>
                {conv.unread_count > 0 && (
                  <span className={cn("shrink-0 text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center text-white", platform === "facebook" ? "bg-[#1877F2]" : platform === "instagram" ? "bg-[#E1306C]" : "bg-[#25D366]")}>
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
        "flex-1 flex flex-col min-w-0",
        mobileView === "list" && "hidden md:flex"
      )}>
        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <Icon size={48} weight="light" className="text-black" />
            <div className="text-center">
              <p className="text-[10px] font-medium tracking-[0.25em] text-black uppercase">Select a conversation</p>
              <p className="text-[9px] text-black mt-1">Messages will appear here</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-black/[0.06] bg-white">
              <button
                onClick={() => setMobileView("list")}
                className="md:hidden p-1 text-black hover:text-black transition-colors"
              >
                <ArrowLeft size={14} />
              </button>
              {selected && <Avatar name={selected.contact_name || "?"} platform={platform} />}
              <div>
                <p className="text-[11px] font-medium text-black">{selected?.contact_name || "Unknown"}</p>
                <p className={cn("text-[9px] flex items-center gap-1", cfg.color)}>
                  <Robot size={9} />
                  AI bot active
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {msgLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black/60 rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[10px] text-black tracking-[0.15em] uppercase">No messages</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn("flex gap-2.5 max-w-[75%]", msg.sender === "bot" ? "flex-row-reverse ml-auto" : "flex-row")}
                    >
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                        msg.sender === "bot" ? "bg-black" : cfg.bg
                      )}>
                        {msg.sender === "bot"
                          ? <Robot size={10} weight="fill" className="text-white" />
                          : <User size={10} weight="fill" className={cfg.color} />}
                      </div>
                      <div className={cn(
                        "rounded-sm px-3 py-2 text-[11px] leading-relaxed",
                        msg.sender === "bot"
                          ? "bg-black text-white"
                          : "bg-white border border-black/[0.07] text-black"
                      )}>
                        {msg.image_url && (
                          <div className="mb-1.5">
                            <img src={msg.image_url} alt="" className="max-w-[160px] rounded" />
                          </div>
                        )}
                        {!msg.image_url && msg.message_type === "image" && (
                          <span className="flex items-center gap-1 text-black"><PhImage size={11} /> Image</span>
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
            <div className="px-5 py-3 border-t border-black/[0.05] bg-white">
              <p className="text-[9px] text-black tracking-[0.1em] text-center">
                AI bot responds automatically · Replies sent via {cfg.label} API
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
