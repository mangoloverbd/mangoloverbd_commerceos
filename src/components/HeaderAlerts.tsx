"use client";

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useSidebarAlerts } from "@/hooks/useSidebarAlerts";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  NotificationCenter,
  type NotificationCenterItem,
} from "@/components/application/notification-center/notification-center";

const popoverPanelClass =
  "w-[400px] overflow-hidden rounded-[20px] border-0 bg-transparent p-0 shadow-none";

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function recencyGroup(createdAt: string): string {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (new Date(createdAt).getTime() >= startOfToday()) return "Today";
  if (ageMs <= 7 * dayMs) return "This week";
  return "Earlier";
}

function shortTimestamp(createdAt: string): string {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const min = Math.floor(ageMs / 60000);
  const hr = Math.floor(ageMs / 3600000);
  const day = Math.floor(ageMs / 86400000);
  if (ageMs < 3600000) return `${Math.max(min, 1)}m`;
  if (ageMs < 86400000) return `${hr}h`;
  if (ageMs < 7 * 86400000) return `${day}d`;
  return new Date(createdAt).toLocaleDateString(undefined, { weekday: "short" });
}

export function HeaderAlerts() {
  const { alerts, stalePending, unsentConfirmed, loading } = useSidebarAlerts();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const notifications = useMemo<NotificationCenterItem[]>(() => {
    const map = (list: typeof stalePending, status: "error" | "information") =>
      list.map((order) => ({
        id: order.id,
        category: "system" as const,
        group: recencyGroup(order.created_at),
        title: `${order.order_number}${order.customer_name ? ` · ${order.customer_name}` : ""}`,
        description:
          status === "error"
            ? `${order.daysOld}d old — needs follow-up`
            : `Confirmed ${shortTimestamp(order.created_at)} ago — not sent to courier`,
        timestamp: shortTimestamp(order.created_at),
        unread: true,
        status,
        actions: [{ id: "view", label: "View", variant: "primary" as const }],
      }));

    return [...map(stalePending, "error"), ...map(unsentConfirmed, "information")];
  }, [stalePending, unsentConfirmed]);

  const handleAction = (notificationId: string, actionId: string) => {
    if (actionId === "view") {
      setOpen(false);
      navigate("/orders");
    }
  };

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
        <NotificationCenter
          notifications={notifications}
          defaultTab="system"
          onAction={handleAction}
        />
      </PopoverContent>
    </Popover>
  );
}
