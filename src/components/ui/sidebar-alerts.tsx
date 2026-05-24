"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { cn } from "@/lib/utils";
import { Clock, Send, X, AlertTriangle } from "lucide-react";
import { useSidebarAlerts, type SidebarAlert } from "@/hooks/useSidebarAlerts";
import { formatDistanceToNow } from "date-fns";
import { TextEffect } from "@/components/ui/text-effect";

const SWIPE_THRESHOLD = 50;
const AI_CHAT_ICON_URL = "https://img.icons8.com/material-rounded/24/bard--v2.png";

type CardDef = {
  id: string;
  type: SidebarAlert["type"];
  count: number;
  sample: SidebarAlert;
  orders: SidebarAlert[];
};

const sidebarTextEffectVariants = {
  container: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.045 },
    },
  },
  item: {
    hidden: { opacity: 0, y: 8, filter: "blur(6px)" },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 0.35, ease: "easeOut" },
    },
  },
};

function SidebarTextEffect({
  children,
  className,
  as = "span",
  per = "word",
  delay = 0.08,
}: {
  children: string;
  className?: string;
  as?: "span" | "p";
  per?: "word" | "char";
  delay?: number;
}) {
  return (
    <TextEffect
      key={children}
      as={as}
      per={per}
      delay={delay}
      variants={sidebarTextEffectVariants}
      className={className}
    >
      {children}
    </TextEffect>
  );
}

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
  const top = anchorRect.top;

  return createPortal(
    <>
      {/* backdrop */}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, x: -8, scale: 0.97 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: -8, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        className="fixed z-[9999] rounded-2xl border border-black/10 bg-white/95 backdrop-blur-xl shadow-2xl shadow-black/15 overflow-hidden"
        style={{ width: panelWidth, left, top }}
      >
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between px-4 py-3 border-b",
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
            "flex gap-2 px-4 py-2.5 border-b",
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

        {/* Order list */}
        <div className="max-h-72 overflow-y-auto divide-y divide-black/5">
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
                  #{order.order_number}
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

  const CARD_H = 72;
  const PEEK = 8; // px each card peeks above
  const containerH = CARD_H + (cards.length - 1) * PEEK;
  const activeCard = cards[safeIndex];
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="mb-1.5 px-1">
      {/* Stack */}
      <div ref={stackRef} className="relative" style={{ height: containerH }}>
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
                opacity: 1,
                scale: 1 - pos * 0.03,
                top: (cards.length - 1 - pos) * PEEK,
                left: 0,
                zIndex: cards.length - pos,
                rotate: 0,
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
              className={cn(
                "absolute right-0 overflow-hidden rounded-xl border cursor-pointer select-none transition-shadow",
                isOpen ? "shadow-md" : "shadow-sm",
                isPending
                  ? isOpen ? "bg-amber-100 border-amber-300" : "bg-amber-50 border-amber-200"
                  : isOpen ? "bg-blue-100 border-blue-300" : "bg-blue-50 border-blue-200"
              )}
              style={{ height: CARD_H }}
            >
              <div className="flex h-full items-center justify-between gap-2.5 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <SidebarTextEffect
                    as="span"
                    per="word"
                    className={cn(
                      "inline-block whitespace-nowrap border-b-2 border-dotted pb-0.5 font-sf-display text-[13px] font-semibold leading-none",
                      isPending ? "border-amber-700/25 text-amber-900" : "border-blue-700/25 text-blue-900"
                    )}
                  >
                    Fulfillment Queue
                  </SidebarTextEffect>
                  <SidebarTextEffect
                    as="p"
                    per="char"
                    delay={0.18}
                    className={cn(
                      "mt-1.5 font-sf-display text-[20px] font-semibold leading-none tracking-tight tabular-nums",
                      isPending ? "text-amber-900" : "text-blue-900"
                    )}
                  >
                    {`${card.count} ${card.count === 1 ? "order" : "orders"}`}
                  </SidebarTextEffect>
                  {isTop && (
                    <SidebarTextEffect
                      as="p"
                      per="word"
                      delay={0.28}
                      className={cn("mt-0.5 truncate text-[10px] font-medium leading-tight", isPending ? "text-amber-600" : "text-blue-600")}
                    >
                      {isPending ? "Needs follow-up" : "Ready for courier"}
                    </SidebarTextEffect>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg",
                    isPending ? "bg-amber-100" : "bg-blue-100"
                  )}>
                    <img src={AI_CHAT_ICON_URL} alt="" className="h-4 w-4 object-contain opacity-80" />
                  </div>
                  <SidebarTextEffect
                    as="span"
                    per="char"
                    delay={0.1}
                    className={cn(
                      "whitespace-nowrap text-[8px] font-medium tabular-nums",
                      isPending ? "text-amber-500" : "text-blue-500"
                    )}
                  >
                    {todayLabel}
                  </SidebarTextEffect>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Dot indicators */}
      {cards.length > 1 && (
        <div className="mt-2 flex justify-center gap-1">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => { setActiveIndex(i); setOpenCard(null); }}
              className={cn(
                "rounded-full transition-all",
                i === safeIndex
                  ? "h-1.5 w-3 bg-foreground/30"
                  : "h-1.5 w-1.5 bg-foreground/15 hover:bg-foreground/25"
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
