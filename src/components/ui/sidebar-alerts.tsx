"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { cn } from "@/lib/utils";
import { Clock, Send, X, AlertTriangle } from "lucide-react";
import { useSidebarAlerts, type SidebarAlert } from "@/hooks/useSidebarAlerts";
import { formatDistanceToNow } from "date-fns";

const SWIPE_THRESHOLD = 50;
const AI_CHAT_ICON_URL = "https://img.icons8.com/material-rounded/24/bard--v2.png";

type CardDef = {
  id: string;
  type: SidebarAlert["type"];
  count: number;
  sample: SidebarAlert;
  orders: SidebarAlert[];
};

function DetailPanel({
  card,
  anchorRect,
  onClose,
  aiInsight,
}: {
  card: CardDef;
  anchorRect: DOMRect;
  onClose: () => void;
  aiInsight?: { headline: string; insight: string };
}) {
  const isPending = card.type === "stale_pending";
  const panelWidth = 288;
  const left = anchorRect.right + 8;

  // Clamp top so the panel never overflows the viewport
  const viewportH = window.innerHeight;
  const estimatedPanelH = Math.min(520, 120 + card.orders.length * 56);
  const rawTop = anchorRect.top;
  const top = Math.min(rawTop, Math.max(8, viewportH - estimatedPanelH - 8));

  return createPortal(
    <>
      {/* backdrop */}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, x: -8, scale: 0.97 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: -8, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        className="fixed z-[9999] rounded-2xl border border-black/10 bg-white/95 backdrop-blur-xl shadow-2xl shadow-black/15 flex flex-col"
        style={{ width: panelWidth, left, top, maxHeight: viewportH - top - 8 }}
      >
        {/* Header */}
        <div className={cn(
          "flex shrink-0 items-center justify-between px-4 py-3 border-b rounded-t-2xl",
          isPending ? "border-amber-100 bg-amber-50" : "border-blue-100 bg-blue-50"
        )}>
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex h-6 w-6 items-center justify-center rounded-lg",
              isPending ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"
            )}>
              <img src={AI_CHAT_ICON_URL} alt="" className="h-4 w-4 object-contain" />
            </div>
            <div>
              <p className={cn("text-[11px] font-bold leading-tight", isPending ? "text-amber-800" : "text-blue-800")}>
                {isPending ? "Stale Pending Orders" : "Confirmed — Not Sent"}
              </p>
              <p className={cn("text-[9px]", isPending ? "text-amber-500" : "text-blue-500")}>
                {card.count} {card.count === 1 ? "order" : "orders"} need attention
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-6 w-6 rounded-full flex items-center justify-center text-black/30 hover:text-black/60 hover:bg-black/5 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* AI Insight */}
        {aiInsight?.insight && (
          <div className={cn(
            "shrink-0 flex gap-2 px-4 py-2.5 border-b",
            isPending ? "bg-amber-50/50 border-amber-100" : "bg-blue-50/50 border-blue-100"
          )}>
            <img src={AI_CHAT_ICON_URL} alt="" className="mt-0.5 h-3.5 w-3.5 shrink-0 object-contain" />
            <div>
              <p className={cn("text-[9px] font-bold uppercase tracking-[0.18em]", isPending ? "text-amber-600" : "text-blue-600")}>
                AI suggestion
              </p>
              <p className="mt-0.5 text-[10px] text-black/55 leading-snug">{aiInsight.insight}</p>
            </div>
          </div>
        )}

        {/* Order list — scrollable, fills remaining height */}
        <div className="flex-1 overflow-y-auto divide-y divide-black/5 overscroll-contain">
          {card.orders.map((order) => (
            <div key={order.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-black/[0.02] transition-colors">
              <div className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
                isPending ? "bg-amber-100 text-amber-500" : "bg-blue-100 text-blue-500"
              )}>
                <AlertTriangle className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-black/80 truncate">
                  {order.order_number}
                  {order.customer_name && (
                    <span className="font-normal text-black/40"> · {order.customer_name}</span>
                  )}
                </p>
                <p className={cn("text-[10px] mt-0.5", isPending ? "text-amber-500" : "text-blue-500")}>
                  {isPending
                    ? `${order.daysOld}d old — needs follow-up`
                    : `Confirmed ${formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}`
                  }
                </p>
              </div>
              <span className={cn(
                "shrink-0 mt-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                isPending ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"
              )}>
                {isPending ? "Pending" : "Unsent"}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </>,
    document.body
  );
}

export function SidebarAlerts() {
  const { alerts, stalePending, unsentConfirmed, aiInsights, loading } = useSidebarAlerts();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const stackRef = useRef<HTMLDivElement>(null);

  const updateAnchor = useCallback(() => {
    if (stackRef.current) {
      setAnchorRect(stackRef.current.getBoundingClientRect());
    }
  }, []);

  useEffect(() => {
    if (!openCard) return;
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);
    return () => {
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
    };
  }, [openCard, updateAnchor]);

  if (loading || alerts.length === 0) return null;

  const cards: CardDef[] = [
    stalePending.length > 0 && {
      id: "stale_pending",
      type: "stale_pending" as const,
      count: stalePending.length,
      sample: stalePending[0],
      orders: stalePending,
    },
    unsentConfirmed.length > 0 && {
      id: "unsent_confirmed",
      type: "unsent_confirmed" as const,
      count: unsentConfirmed.length,
      sample: unsentConfirmed[0],
      orders: unsentConfirmed,
    },
  ].filter(Boolean) as CardDef[];

  if (cards.length === 0) return null;

  const safeIndex = activeIndex % cards.length;

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    const swipe = Math.abs(offset.x) * velocity.x;
    if (offset.x < -SWIPE_THRESHOLD || swipe < -1000) {
      setActiveIndex((p) => (p + 1) % cards.length);
      setOpenCard(null);
    } else if (offset.x > SWIPE_THRESHOLD || swipe > 1000) {
      setActiveIndex((p) => (p - 1 + cards.length) % cards.length);
      setOpenCard(null);
    }
    setIsDragging(false);
  };

  const displayCards = cards.map((c, i) => ({
    ...c,
    stackPosition: (i - safeIndex + cards.length) % cards.length,
  }));

  const CARD_H = 64;
  const PEEK = 6; // px each card peeks above
  const containerH = CARD_H + (cards.length - 1) * PEEK;
  const activeCard = cards[safeIndex];

  return (
    <div className="mb-1.5 px-1">
      {/* Stack */}
      <div ref={stackRef} className="relative overflow-hidden" style={{ height: containerH }}>
        {displayCards.map((card) => {
          const isTop = card.stackPosition === 0;
          const pos = card.stackPosition;
          const isPending = card.type === "stale_pending";
          const isOpen = openCard === card.id && isTop;

          return (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{
                opacity: isTop ? 1 : 0.6,
                scale: 1 - pos * 0.04,
                top: (cards.length - 1 - pos) * PEEK,
                zIndex: cards.length - pos,
              }}
              exit={{ opacity: 0, scale: 0.8, x: -200 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              drag={isTop ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={handleDragEnd}
              whileDrag={{ scale: 1.02, cursor: "grabbing" }}
              onClick={() => {
                if (isDragging) return;
                if (!isTop) {
                  setActiveIndex(cards.findIndex((c) => c.id === card.id));
                  setOpenCard(null);
                } else {
                  if (isOpen) {
                    setOpenCard(null);
                  } else {
                    updateAnchor();
                    setOpenCard(card.id);
                  }
                }
              }}
              className="absolute left-0 right-0 cursor-pointer select-none overflow-hidden"
              style={{
                height: CARD_H,
                background: "#f7f7f6",
                border: "3px solid #d0cfcc",
                borderRadius: 30,
                boxShadow: "0 8px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.8)",
              }}
            >
              <div className="flex h-full items-center gap-3 px-4">
                {/* Icon */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#d0cfcc] bg-white">
                  {isPending
                    ? <Clock className="h-4 w-4 text-amber-500" />
                    : <Send className="h-4 w-4 text-blue-500" />
                  }
                </div>
                {/* Text */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] text-[#999] leading-tight">
                    {isPending ? "Needs follow-up" : "Ready for courier"}
                  </p>
                  <p className="truncate text-[14px] font-semibold text-[#1a1a1a] leading-tight mt-0.5 tabular-nums">
                    {card.count} {card.count === 1 ? "order" : "orders"}
                  </p>
                </div>
                {/* Chevron */}
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#bbb]"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Dot indicators */}
      {cards.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => { setActiveIndex(i); setOpenCard(null); }}
              className={cn(
                "rounded-full transition-all",
                i === safeIndex
                  ? "h-2 w-4 bg-[#999]"
                  : "h-2 w-2 bg-[#c0c0c0] hover:bg-[#aaa]"
              )}
            />
          ))}
        </div>
      )}

      {/* Portal detail panel */}
      <AnimatePresence>
        {openCard && activeCard && anchorRect && (
          <DetailPanel
            key={openCard}
            card={activeCard}
            anchorRect={anchorRect}
            onClose={() => setOpenCard(null)}
            aiInsight={
              activeCard.type === "stale_pending"
                ? aiInsights.stalePending
                : aiInsights.unsentConfirmed
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}
