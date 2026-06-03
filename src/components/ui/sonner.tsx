"use client";

import React, { useSyncExternalStore } from "react";
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

function getIndicator(type: ToastType) {
  switch (type) {
    case "success":
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
            <path d="M3.5 8.5L6.5 11.5L12.5 5" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      );
    case "error":
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50">
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
            <path d="M8 5V8.5M8 11H8.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
      );
    case "loading":
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50">
          <svg className="h-4 w-4 animate-spin text-gray-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5"/>
            <path className="opacity-80" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </div>
      );
    default:
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
            <path d="M8 7V11M8 5H8.01" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
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
        initial={{ opacity: 0, x: 24, scale: 0.96 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 24, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="rounded-xl bg-white border border-gray-200 shadow-lg overflow-hidden"
      >
        {item.render(item.id)}
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 24, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="group relative flex items-start gap-3 rounded-xl bg-white border border-gray-200 shadow-lg px-4 py-3 min-w-[320px] max-w-[400px]"
    >
      {getIndicator(item.type)}
      <div className="flex-1 min-w-0 pt-0.5">
        {item.title && (
          <p className="text-[13px] font-medium leading-snug text-gray-900">
            {item.title}
          </p>
        )}
        {item.description && (
          <p className="text-[12px] leading-relaxed text-gray-500 mt-0.5">
            {item.description}
          </p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 mt-0.5 flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:text-gray-600 hover:bg-gray-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

function Toaster() {
  const items = useToastStore();

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2.5 items-end pointer-events-none">
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
