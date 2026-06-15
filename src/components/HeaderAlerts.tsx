"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Clock, Send, AlertTriangle, X } from "lucide-react";
import { useSidebarAlerts } from "@/hooks/useSidebarAlerts";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const popoverPanelClass =
  "w-80 overflow-hidden rounded-[14px] border-[1.5px] border-black/[0.07] bg-[#E9E8E5] p-1 text-[#202020] shadow-[0_2px_6px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.7)]";

const popoverInnerClass =
  "rounded-[10px] border border-black/[0.05] bg-[#F7F7F6] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(0,0,0,0.06)]";

const alertRowClass =
  "flex items-start gap-3 rounded-[10px] border border-black/[0.05] bg-[#FBFBFA] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition-colors hover:bg-white";

export function HeaderAlerts() {
  const { alerts, stalePending, unsentConfirmed, loading } = useSidebarAlerts();
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <button
        className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5"
        disabled
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className="text-[#6f6f6f] animate-pulse">
          <path fill="currentColor" d="M22 5a3 3 0 1 1-6 0a3 3 0 0 1 6 0"/>
          <path fill="currentColor" fillRule="evenodd" d="M6.25 14a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5H7a.75.75 0 0 1-.75-.75" clipRule="evenodd"/>
          <path fill="currentColor" fillRule="evenodd" d="M3.464 20.536C4.93 22 7.286 22 12 22s7.071 0 8.535-1.465C22 19.072 22 16.714 22 12c0-1.399 0-2.59-.038-3.612a4.5 4.5 0 0 1-6.35-6.35C14.59 2 13.399 2 12 2C7.286 2 4.929 2 3.464 3.464C2 4.93 2 7.286 2 12s0 7.071 1.464 8.535M6.25 17.5a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5H7a.75.75 0 0 1-.75-.75" clipRule="evenodd"/>
        </svg>
      </button>
    );
  }

  if (alerts.length === 0) {
    return (
      <button
        className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5 hover:text-black"
        title="No alerts"
        type="button"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className="text-[#6f6f6f]">
          <path fill="currentColor" d="M22 5a3 3 0 1 1-6 0a3 3 0 0 1 6 0"/>
          <path fill="currentColor" fillRule="evenodd" d="M6.25 14a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5H7a.75.75 0 0 1-.75-.75" clipRule="evenodd"/>
          <path fill="currentColor" fillRule="evenodd" d="M3.464 20.536C4.93 22 7.286 22 12 22s7.071 0 8.535-1.465C22 19.072 22 16.714 22 12c0-1.399 0-2.59-.038-3.612a4.5 4.5 0 0 1-6.35-6.35C14.59 2 13.399 2 12 2C7.286 2 4.929 2 3.464 3.464C2 4.93 2 7.286 2 12s0 7.071 1.464 8.535M6.25 17.5a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5H7a.75.75 0 0 1-.75-.75" clipRule="evenodd"/>
        </svg>
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5 hover:text-black"
          title={`${alerts.length} alert${alerts.length === 1 ? "" : "s"}`}
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className="text-[#6f6f6f]">
            <path fill="currentColor" d="M22 5a3 3 0 1 1-6 0a3 3 0 0 1 6 0"/>
            <path fill="currentColor" fillRule="evenodd" d="M6.25 14a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5H7a.75.75 0 0 1-.75-.75" clipRule="evenodd"/>
            <path fill="currentColor" fillRule="evenodd" d="M3.464 20.536C4.93 22 7.286 22 12 22s7.071 0 8.535-1.465C22 19.072 22 16.714 22 12c0-1.399 0-2.59-.038-3.612a4.5 4.5 0 0 1-6.35-6.35C14.59 2 13.399 2 12 2C7.286 2 4.929 2 3.464 3.464C2 4.93 2 7.286 2 12s0 7.071 1.464 8.535M6.25 17.5a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5H7a.75.75 0 0 1-.75-.75" clipRule="evenodd"/>
          </svg>
          <AnimatePresence>
            {alerts.length > 0 && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="absolute -top-0.5 -right-0.5"
              >
                <Badge className="h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold border-0 shadow-sm">
                  {alerts.length > 9 ? "9+" : alerts.length}
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className={popoverPanelClass}
      >
        <div className={cn(popoverInnerClass, "px-4 py-3")}>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#7F7F7D]">Alerts</p>
          <p className="mt-1 text-[12px] font-light text-[#202020]">{alerts.length} items need attention</p>
        </div>
        <div className="mt-1 max-h-[400px] space-y-1 overflow-y-auto overscroll-contain">
          {stalePending.length > 0 && (
            <div className={cn(popoverInnerClass, "p-2")}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-black/[0.04]">
                  <Clock className="h-3 w-3 text-[#8A6A28]" />
                </div>
                <p className="text-[9px] font-medium uppercase tracking-[0.24em] text-[#8A6A28]">
                  Stale Pending ({stalePending.length})
                </p>
              </div>
              <div className="space-y-1">
                {stalePending.slice(0, 5).map((order) => (
                  <div key={order.id} className={alertRowClass}>
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#E9E8E5]">
                    <AlertTriangle className="h-3 w-3 text-[#8A6A28]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-[#202020]">
                      {order.order_number}
                      {order.customer_name && (
                        <span className="font-normal text-black/45"> · {order.customer_name}</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[10px] text-black/45">
                      {order.daysOld}d old — needs follow-up
                    </p>
                  </div>
                  <span className="mt-0.5 shrink-0 rounded-full border border-black/[0.06] bg-[#E9E8E5] px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.18em] text-[#8A6A28]">
                    Pending
                  </span>
                  </div>
                ))}
              </div>
              {stalePending.length > 5 && (
                <p className="py-1.5 text-center text-[10px] text-black/40">
                  +{stalePending.length - 5} more
                </p>
              )}
            </div>
          )}
          {unsentConfirmed.length > 0 && (
            <div className={cn(popoverInnerClass, "p-2")}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-black/[0.04]">
                  <Send className="h-3 w-3 text-[#4F657A]" />
                </div>
                <p className="text-[9px] font-medium uppercase tracking-[0.24em] text-[#4F657A]">
                  Unsent Confirmed ({unsentConfirmed.length})
                </p>
              </div>
              <div className="space-y-1">
                {unsentConfirmed.slice(0, 5).map((order) => (
                  <div key={order.id} className={alertRowClass}>
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#E9E8E5]">
                    <AlertTriangle className="h-3 w-3 text-[#4F657A]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-[#202020]">
                      {order.order_number}
                      {order.customer_name && (
                        <span className="font-normal text-black/45"> · {order.customer_name}</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[10px] text-black/45">
                      Confirmed {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <span className="mt-0.5 shrink-0 rounded-full border border-black/[0.06] bg-[#E9E8E5] px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.18em] text-[#4F657A]">
                    Unsent
                  </span>
                  </div>
                ))}
              </div>
              {unsentConfirmed.length > 5 && (
                <p className="py-1.5 text-center text-[10px] text-black/40">
                  +{unsentConfirmed.length - 5} more
                </p>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
