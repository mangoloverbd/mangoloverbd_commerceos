import { useState, useEffect, useRef, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import FacebookLogo from "@/components/FacebookLogo";
import WhatsappLogo from "@/components/WhatsappLogo";
import InstagramLogo from "@/components/InstagramLogo";
import {
  Robot,
  User,
  Image as PhImage,
  MagnifyingGlass,
  ArrowLeft,
  Trash,
  PaperPlaneRight,
} from "@phosphor-icons/react";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";

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

const ICON_SIZE: Record<Platform, (base: number) => number> = {
  facebook: (n) => Math.round(n * 1.15),
  instagram: (n) => n,
  whatsapp: (n) => Math.round(n * 1.35),
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
        <Icon size={ICON_SIZE[platform](8)} weight="fill" className={cfg.color} />
      </div>
    </div>
  );
}

function InboxStat({
  label,
  value,
  sub,
  accent = "text-black",
  loading = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  loading?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl bg-black/[0.04] px-4 py-2.5"
    >
      <p className="text-[8px] font-medium tracking-[0.3em] text-black/45 uppercase">{label}</p>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-5 w-12 animate-pulse rounded bg-black/[0.06]"
            />
          ) : (
            <motion.p
              key="value"
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={cn("text-[22px] font-light tabular-nums tracking-[-0.04em] leading-tight", accent)}
            >
              {value}
            </motion.p>
          )}
        </AnimatePresence>
        {sub && !loading && <p className="text-[10px] text-black/40">{sub}</p>}
      </div>
    </motion.div>
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [pausedAi, setPausedAi] = useState(false);
  const [togglingAi, setTogglingAi] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isInitialLoad = useRef(true);
  const cfg = PLATFORM_CONFIG[platform];
  const Icon = cfg.icon;

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/social/conversations/${platform}`)
      .then((r) => r.json())
      .then((d) => setConversations(d.conversations || []))
      .catch(() => {})
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      apiFetch(`/api/social/conversations/${platform}`)
        .then((r) => r.json())
        .then((d) => setConversations(d.conversations || []))
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [platform]);

  useEffect(() => {
    if (!selectedId) return;
    setMsgLoading(true);
    setReplyText("");
    apiFetch(`/api/social/messages/${selectedId}`)
      .then((r) => r.json())
      .then((d) => {
        setMessages(d.messages || []);
        setPausedAi(d.paused_ai || false);
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c))
        );
      })
      .catch(() => {})
      .finally(() => setMsgLoading(false));

    const interval = setInterval(() => {
      apiFetch(`/api/social/messages/${selectedId}`)
        .then((r) => r.json())
        .then((d) => {
          setMessages(d.messages || []);
          setPausedAi(d.paused_ai || false);
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [selectedId]);

  useEffect(() => {
    isInitialLoad.current = true;
  }, [selectedId]);

  useEffect(() => {
    if (messages.length === 0) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    if (isInitialLoad.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      isInitialLoad.current = false;
      return;
    }
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 120) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const filtered = conversations.filter((c) =>
    (c.contact_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.last_message || "").toLowerCase().includes(search.toLowerCase())
  );

  const unreadTotal = useMemo(
    () => filtered.reduce((sum, c) => sum + (c.unread_count || 0), 0),
    [filtered]
  );

  const recentCount = useMemo(() => {
    const hourAgo = Date.now() - 3600000;
    return filtered.filter((c) => new Date(c.last_message_at).getTime() > hourAgo).length;
  }, [filtered]);

  const selected = conversations.find((c) => c.id === selectedId);

  function selectConversation(id: string) {
    setSelectedId(id);
    setMobileView("chat");
  }

  async function sendReply() {
    if (!selectedId || !replyText.trim() || sending) return;
    setSending(true);
    try {
      const res = await apiFetch("/api/social/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, text: replyText.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to send");
      }
      const now = new Date().toISOString();
      setMessages((prev) => [...prev, {
        id: `temp-${Date.now()}`,
        conversation_id: selectedId,
        sender: "bot",
        content: replyText.trim(),
        image_url: null,
        message_type: "text",
        created_at: now,
      }]);
      setConversations((prev) =>
        prev.map((c) => c.id === selectedId ? { ...c, last_message: replyText.trim().slice(0, 200), last_message_at: now } : c)
      );
      setReplyText("");
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  async function toggleAi() {
    if (!selectedId || togglingAi) return;
    setTogglingAi(true);
    const newPaused = !pausedAi;
    try {
      const res = await apiFetch(`/api/social/conversations/${selectedId}/pause-ai`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: newPaused }),
      });
      if (!res.ok) throw new Error("Failed to toggle");
      setPausedAi(newPaused);
      toast.success(newPaused ? "Switched to Human mode" : "AI auto-reply enabled");
    } catch {
      toast.error("Failed to toggle AI mode");
    } finally {
      setTogglingAi(false);
    }
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("Delete this conversation? All messages will be permanently removed.")) return;
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/social/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to delete");
      }
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setMessages([]);
        setMobileView("list");
      }
      toast.success("Conversation deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete conversation");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 bg-white p-1 lg:p-2">
      {/* ── Header + stat cards ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-3"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", cfg.bg)}>
              <Icon size={ICON_SIZE[platform](15)} weight="fill" className={cfg.color} />
            </span>
            <div>
              <h1 className="font-sf-display text-[22px] font-bold tracking-tight text-black">{cfg.label} Inbox</h1>
              <p className="text-[12px] text-black/45">Live conversations from {cfg.label}</p>
            </div>
          </div>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold", cfg.chip)}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            Live
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <InboxStat label="Conversations" value={filtered.length} sub="threads" loading={loading} />
          <InboxStat
            label="Unread"
            value={unreadTotal}
            sub="messages"
            accent={unreadTotal > 0 ? "text-black" : "text-black/30"}
            loading={loading}
          />
          <InboxStat label="Active 1h" value={recentCount} sub="recent" loading={loading} />
        </div>
      </motion.div>

      {/* ── Board card: two-panel chat ──────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.4 }}
        className="flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-black/[0.04]"
      >
        {/* ── Conversation list ─────────────────────────────────────────── */}
        <div className={cn(
          "flex w-full shrink-0 flex-col overflow-hidden md:w-72 lg:w-80",
          mobileView === "chat" && "hidden md:flex"
        )}>
          {/* Search */}
          <div className="shrink-0 border-b border-black/[0.06] px-3 py-2.5">
            <div className="relative flex h-8 items-center gap-2 rounded-full bg-black/[0.05] px-3">
              <MagnifyingGlass size={13} weight="light" className="shrink-0 text-black/35" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-black/35"
                data-testid="input-search-conversations"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-0">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse border-b border-black/[0.04] px-4 py-3.5">
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
                  <Icon size={ICON_SIZE[platform](22)} weight="fill" className={cfg.color} />
                </span>
                <p className="text-[12px] font-medium text-black/40">No conversations yet</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {filtered.map((conv) => (
                  <motion.div
                    key={conv.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16, height: 0, overflow: "hidden" }}
                    transition={{ duration: 0.2 }}
                    className="group relative"
                  >
                    <button
                      onClick={() => selectConversation(conv.id)}
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-black/[0.04] px-4 py-3.5 text-left transition-colors hover:bg-black/[0.025]",
                        selectedId === conv.id && "bg-black/[0.045]"
                      )}
                      data-testid={`button-conversation-${conv.id}`}
                    >
                      <Avatar name={conv.contact_name || "?"} platform={platform} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[12px] font-semibold text-foreground">{conv.contact_name || "Unknown"}</span>
                          <span className="shrink-0 text-[10px] text-black/35">{formatTime(conv.last_message_at)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-black/40">{conv.last_message || "—"}</p>
                      </div>
                      {conv.unread_count > 0 && (
                        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white", platform === "facebook" ? "bg-[#1877F2]" : platform === "instagram" ? "bg-[#E1306C]" : "bg-[#25D366]")}>
                          {conv.unread_count > 9 ? "9+" : conv.unread_count}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={(e) => deleteConversation(conv.id, e)}
                      disabled={deletingId === conv.id}
                      title="Delete conversation"
                      className="absolute right-3 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-lg text-black/20 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 disabled:opacity-50"
                    >
                      {deletingId === conv.id
                        ? <Spinner className="h-3 w-3" />
                        : <Trash size={12} weight="light" />}
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Vertical divider */}
        <div className="hidden w-px shrink-0 bg-black/[0.06] md:block" />

        {/* ── Chat panel ────────────────────────────────────────────────── */}
        <div className={cn(
          "flex min-w-0 flex-1 flex-col overflow-hidden",
          mobileView === "list" && "hidden md:flex"
        )}>
          {!selectedId ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
              <span className={cn("flex h-16 w-16 items-center justify-center rounded-2xl", cfg.bg)}>
                <Icon size={ICON_SIZE[platform](32)} weight="fill" className={cfg.color} />
              </span>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">Select a conversation</p>
                <p className="mt-1 text-[12px] text-muted-foreground">Messages will appear here</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex h-[58px] shrink-0 items-center gap-3 border-b border-black/[0.06] px-4">
                <button
                  onClick={() => setMobileView("list")}
                  className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground md:hidden"
                >
                  <ArrowLeft size={14} />
                </button>
                {selected && <Avatar name={selected.contact_name || "?"} platform={platform} />}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">{selected?.contact_name || "Unknown"}</p>
                  <p className={cn("flex items-center gap-1 text-[10px] font-medium", pausedAi ? "text-amber-600" : cfg.color)}>
                    {pausedAi ? <User size={9} weight="fill" /> : <Robot size={9} />}
                    {pausedAi ? "Human mode" : "AI bot active"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn("text-[9px] font-semibold tracking-wide transition-colors", !pausedAi ? "text-black" : "text-black/30")}>
                    AI
                  </span>
                  <Switch
                    checked={pausedAi}
                    onCheckedChange={() => { if (!togglingAi) toggleAi(); }}
                    disabled={togglingAi}
                    className="h-[18px] w-8 data-[state=checked]:bg-amber-400 data-[state=unchecked]:bg-black"
                    thumbClassName="h-3.5 w-3.5 data-[state=checked]:translate-x-3.5"
                  />
                  <span className={cn("text-[9px] font-semibold tracking-wide transition-colors", pausedAi ? "text-amber-600" : "text-black/30")}>
                    Human
                  </span>
                </div>
              </div>

              {/* Messages */}
              <div ref={scrollContainerRef} className="flex-1 space-y-3 overflow-y-auto bg-black/[0.02] px-4 py-4">
                {msgLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <Spinner className="text-black/30" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-[12px] font-medium text-black/35">No messages</p>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {messages.map((msg) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "flex",
                          msg.sender === "bot" ? "justify-end" : "justify-start"
                        )}
                      >
                        <div className="max-w-[72%]">
                          {msg.image_url && (
                            <div className="mb-1.5 max-w-[200px] rounded-2xl bg-black/[0.04] p-1.5">
                              <img src={msg.image_url} alt="" className="block max-h-[120px] max-w-[184px] rounded-xl object-cover" />
                            </div>
                          )}
                          {!msg.image_url && msg.message_type === "image" && (
                            <div className={cn(
                              "rounded-2xl px-3.5 py-1.5",
                              msg.sender === "bot"
                                ? "bg-black text-white"
                                : "border border-black/[0.08] bg-white text-foreground"
                            )}>
                              <span className="flex items-center gap-1 text-sm leading-5"><PhImage size={13} /> Image</span>
                            </div>
                          )}
                          {msg.content && (
                            <div className={cn(
                              "rounded-2xl px-3.5 py-1.5 transition-colors",
                              msg.sender === "bot"
                                ? "bg-black text-white"
                                : "border border-black/[0.08] bg-white text-foreground"
                            )}>
                              <p className="text-sm leading-5 whitespace-pre-wrap break-words">{msg.content}</p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div className="shrink-0 border-t border-black/[0.06] px-4 pb-4 pt-3">
                {pausedAi ? (
                  <div className="relative rounded-2xl bg-black/[0.04] focus-within:bg-black/[0.06] transition-all">
                    <textarea
                      ref={textareaRef}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); }
                      }}
                      placeholder="Type a reply..."
                      rows={1}
                      className="w-full resize-none bg-transparent px-3.5 pt-3 pb-0 text-[13px] leading-[1.6] text-foreground placeholder:text-black/35 focus:outline-none"
                      style={{ minHeight: "36px", maxHeight: "120px" }}
                      onInput={(e) => {
                        const t = e.currentTarget;
                        t.style.height = "36px";
                        t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
                      }}
                    />
                    <div className="flex items-center justify-end px-2 pb-2 pt-1">
                      <button
                        onClick={sendReply}
                        disabled={!replyText.trim() || sending}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full transition-all",
                          replyText.trim() ? "bg-black text-white hover:bg-black/80" : "bg-black/15 text-black/30"
                        )}
                      >
                        {sending ? <Spinner className="h-3.5 w-3.5" /> : <PaperPlaneRight size={14} weight="fill" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative rounded-2xl bg-black/[0.04]">
                    <div className="px-3.5 py-3">
                      <p className="text-[13px] leading-[1.6] text-black/40 flex items-center gap-1.5">
                        <Robot size={13} weight="light" />
                        AI bot responds automatically
                      </p>
                    </div>
                  </div>
                )}
                <p className="mt-2 text-center text-[10px] font-medium text-black/35">
                  Replies sent via {cfg.label} API
                </p>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
