import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { X, SpinnerGap } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";

export type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};

function timeAgo(iso?: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function OrderChatHistory({
  open,
  onClose,
  onSelect,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (c: Conversation) => void;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ conversations: Conversation[] }>({
    queryKey: ["/api/order-chat/history"],
    queryFn: async () => {
      const res = await apiFetch("/api/order-chat/history");
      return res.json();
    },
    enabled: open,
  });

  const del = async (id: string) => {
    const res = await apiFetch(`/api/order-chat/history/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error((d as { error?: string }).error || "Failed to delete");
      return;
    }
    // Remove from cache immediately so AnimatePresence can play the exit animation.
    qc.setQueryData<{ conversations: Conversation[] }>(
      ["/api/order-chat/history"],
      (old) =>
        old ? { conversations: old.conversations.filter((c) => c.id !== id) } : old,
    );
  };

  const convos = data?.conversations || [];

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          aria-label="Chat history"
          initial={{ opacity: 0, y: -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
          style={{ transformOrigin: "top right" }}
          className="absolute right-4 top-14 z-20 w-[320px] overflow-hidden rounded-[22px] bg-white/70 shadow-[0_6px_20px_-12px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150"
        >
          <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-semibold tracking-[-0.01em] text-zinc-800">
                History
              </span>
              {!isLoading && convos.length > 0 && (
                <span className="text-[13px] tabular-nums text-zinc-400">{convos.length}</span>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close history"
              className="flex size-6 items-center justify-center rounded-full bg-black/[0.05] text-zinc-500 transition-colors hover:bg-black/[0.09] hover:text-zinc-700"
            >
              <X weight="bold" size={13} />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto overscroll-contain px-2 pb-2">
            {isLoading ? (
              <div className="flex flex-col">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="mb-0.5 flex items-center gap-2 rounded-xl px-2.5 py-2">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div
                        className="h-3 animate-pulse rounded-full bg-black/[0.07]"
                        style={{ width: `${70 - i * 8}%` }}
                      />
                      <div className="h-2 w-1/3 animate-pulse rounded-full bg-black/[0.05]" />
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-center gap-2 py-3 text-[12px] text-zinc-400">
                  <SpinnerGap weight="bold" size={14} className="animate-spin" />
                  Loading history
                </div>
              </div>
            ) : convos.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
                <p className="text-[13px] font-medium text-zinc-600">No conversations yet</p>
                <p className="max-w-52 text-[12px] text-zinc-400">
                  Your saved chats will appear here.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col">
                <AnimatePresence initial={false}>
                  {convos.map((c) => (
                    <motion.li
                      key={c.id}
                      initial={{ opacity: 1, height: "auto" }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{
                        height: { duration: 0.28, ease: [0.32, 0.72, 0, 1] },
                        opacity: { duration: 0.18, ease: "easeOut" },
                      }}
                      className="overflow-hidden"
                    >
                      <div className="group/item mb-0.5 flex items-center gap-2 rounded-xl px-2.5 py-2 transition-colors hover:bg-black/[0.045]">
                        <button onClick={() => onSelect(c)} className="min-w-0 flex-1 text-left">
                          <p className="truncate text-[13px] font-medium text-zinc-800">
                            {c.title || "New chat"}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                            {timeAgo(c.updated_at)} · {c.message_count} msgs
                          </p>
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => void del(c.id)}
                            aria-label="Delete conversation"
                            className="flex size-7 shrink-0 items-center justify-center rounded-full text-zinc-400 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover/item:opacity-100"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                            >
                              <path
                                d="M16.8203 2H7.18031C5.05031 2 3.32031 3.74 3.32031 5.86V19.95C3.32031 21.75 4.61031 22.51 6.19031 21.64L11.0703 18.93C11.5903 18.64 12.4303 18.64 12.9403 18.93L17.8203 21.64C19.4003 22.52 20.6903 21.76 20.6903 19.95V5.86C20.6803 3.74 18.9503 2 16.8203 2ZM15.0103 9.75C14.0403 10.1 13.0203 10.28 12.0003 10.28C10.9803 10.28 9.96031 10.1 8.99031 9.75C8.60031 9.61 8.40031 9.18 8.54031 8.79C8.69031 8.4 9.12031 8.2 9.51031 8.34C11.1203 8.92 12.8903 8.92 14.5003 8.34C14.8903 8.2 15.3203 8.4 15.4603 8.79C15.6003 9.18 15.4003 9.61 15.0103 9.75Z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
