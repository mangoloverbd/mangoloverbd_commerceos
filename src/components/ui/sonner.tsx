"use client";

import React, { useState, useCallback, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type ToastType = "success" | "error" | "info" | "loading" | "custom";

interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  description?: string;
  render?: (id: string) => React.ReactNode;
  duration: number;
}

let toastId = 0;
let toasts: ToastItem[] = [];
let listeners: Set<() => void> = new Set();

function notify() {
  listeners.forEach((l) => l());
}

function addToast(item: Omit<ToastItem, "id">): string {
  const id = String(++toastId);
  toasts = [...toasts, { ...item, id }];
  notify();

  if (item.duration !== Infinity) {
    setTimeout(() => {
      removeToast(id);
    }, item.duration);
  }

  return id;
}

function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

function useToastStore() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts
  );
}

function getIcon(type: ToastType) {
  switch (type) {
    case "success":
      return (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#34C759]/[0.12]">
          <svg viewBox="0 0 10 10" className="h-3 w-3" fill="none">
            <path d="M2 5.5L4 7.5L8 3" stroke="#34C759" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      );
    case "error":
      return (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FF3B30]/[0.10]">
          <svg viewBox="0 0 10 10" className="h-3 w-3" fill="none">
            <path d="M5 3V5.5M5 7H5.01" stroke="#FF3B30" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </span>
      );
    case "loading":
      return (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          <svg className="h-4 w-4 animate-spin text-[#86868b]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5"/>
            <path className="opacity-80" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </span>
      );
    default:
      return (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0071E3]/[0.10]">
          <svg viewBox="0 0 10 10" className="h-3 w-3" fill="none">
            <path d="M5 4.5V7M5 3H5.01" stroke="#0071E3" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </span>
      );
  }
}

const toast = Object.assign(
  (message: string) => {
    return addToast({ type: "info", title: message, duration: 4000 });
  },
  {
    success: (message: string) => {
      return addToast({ type: "success", title: message, duration: 4000 });
    },
    error: (message: string) => {
      return addToast({ type: "error", title: message, duration: 5000 });
    },
    info: (message: string) => {
      return addToast({ type: "info", title: message, duration: 4000 });
    },
    loading: (message: string) => {
      return addToast({ type: "loading", title: message, duration: Infinity });
    },
    warning: (message: string) => {
      return addToast({ type: "info", title: message, duration: 4000 });
    },
    custom: (render: (id: string) => React.ReactNode, opts?: { duration?: number }) => {
      return addToast({ type: "custom", render, duration: opts?.duration ?? 4000 });
    },
    dismiss: (id?: string) => {
      if (id) {
        removeToast(id);
      } else {
        toasts = [];
        notify();
      }
    },
  }
);

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  if (item.type === "custom" && item.render) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="rounded-2xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_4px_6px_-1px_rgba(0,0,0,0.07),0_10px_24px_-4px_rgba(0,0,0,0.10),0_1px_0_rgba(255,255,255,0.9)_inset] overflow-hidden"
      >
        {item.render(item.id)}
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className={[
        "group flex w-full items-start gap-3",
        "rounded-2xl bg-white px-4 py-3.5",
        "shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_4px_6px_-1px_rgba(0,0,0,0.07),0_10px_24px_-4px_rgba(0,0,0,0.10),0_1px_0_rgba(255,255,255,0.9)_inset]",
        "min-w-[280px] max-w-[360px]",
        "font-[system-ui,-apple-system,'SF_Pro_Text','Inter',sans-serif]",
        "relative overflow-hidden",
        item.type === "error" && "shadow-[0_0_0_1px_rgba(255,59,48,0.12),0_4px_6px_-1px_rgba(0,0,0,0.07),0_10px_24px_-4px_rgba(0,0,0,0.10),0_1px_0_rgba(255,255,255,0.9)_inset]",
      ].filter(Boolean).join(" ")}
    >
      {getIcon(item.type)}
      <div className="flex-1 min-w-0">
        {item.title && (
          <p className="text-[13px] font-semibold leading-snug text-[#1d1d1f] tracking-[-0.01em]">
            {item.title}
          </p>
        )}
        {item.description && (
          <p className="text-[12px] font-normal leading-relaxed text-[#86868b] mt-0.5">
            {item.description}
          </p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-black/[0.05] text-[#86868b] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/[0.09]"
      >
        <X className="h-3 w-3" />
      </button>
    </motion.div>
  );
}

function Toaster() {
  const items = useToastStore();

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-3 items-end pointer-events-none">
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <div key={item.id} className="pointer-events-auto">
            <ToastCard item={item} onDismiss={() => removeToast(item.id)} />
          </div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}

export { Toaster, toast };
