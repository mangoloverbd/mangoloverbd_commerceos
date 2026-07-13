"use client";

import React, { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X, Check, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Spinner } from "./ios-spinner";
import { UnsavedChangesToast } from "./unsaved-changes-toast";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info" | "loading" | "custom";

const DARK_SHADOWS =
  "shadow-[0px_32px_64px_-16px_rgba(0,0,0,0.30)] shadow-[0px_16px_32px_-8px_rgba(0,0,0,0.30)] shadow-[0px_8px_16px_-4px_rgba(0,0,0,0.24)] shadow-[0px_4px_8px_-2px_rgba(0,0,0,0.24)] shadow-[0px_-8px_16px_-1px_rgba(0,0,0,0.16)] shadow-[0px_2px_4px_-1px_rgba(0,0,0,0.24)] shadow-[0px_0px_0px_1px_rgba(0,0,0,1.00)] shadow-[inset_0px_0px_0px_1px_rgba(255,255,255,0.08)] shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.20)]";

interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  description?: string;
  render?: (id: string) => React.ReactNode;
  duration: number;
  fit?: boolean;
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

function dismiss(id?: string) {
  if (id) {
    removeToast(id);
  } else {
    toasts = [];
    notify();
  }
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
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
          <Check className="h-4 w-4 text-emerald-400" />
        </div>
      );
    case "error":
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/15">
          <X className="h-4 w-4 text-red-400" />
        </div>
      );
    case "loading":
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
          <Spinner size="sm" />
        </div>
      );
    default:
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
          <Info className="h-4 w-4 text-blue-400" />
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
    custom: (render: (id: string) => React.ReactNode, opts?: { duration?: number; fit?: boolean }) => {
      return addToast({ type: "custom", render, duration: opts?.duration ?? 4000, fit: opts?.fit });
    },
    unsaved: (opts: {
      message?: string;
      savingText?: string;
      savedText?: string;
      onSave?: () => void | Promise<void>;
      onReset?: () => void;
      onSaved?: () => void;
    }) => {
      return addToast({
        type: "custom",
        duration: Infinity,
        fit: true,
        render: (id) => (
          <UnsavedChangesToast
            id={id}
            message={opts.message}
            savingText={opts.savingText}
            savedText={opts.savedText}
            onSave={opts.onSave}
            onReset={opts.onReset}
            onSaved={opts.onSaved}
          />
        ),
      });
    },
    dismiss: (id?: string) => {
      dismiss(id);
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
        className="w-fit"
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
      className={cn("group relative flex items-start gap-3 rounded-[14px] bg-[#131316] px-4 py-3 min-w-[320px] max-w-[400px] text-white", DARK_SHADOWS)}
    >
      {getIndicator(item.type)}
      <div className="flex-1 min-w-0 pt-0.5">
        {item.title && (
          <p className="text-[13px] font-medium leading-snug text-white">
            {item.title}
          </p>
        )}
        {item.description && (
          <p className="text-[12px] leading-relaxed text-white/50 mt-0.5">
            {item.description}
          </p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 mt-0.5 flex h-6 w-6 items-center justify-center rounded-md text-white/40 transition-colors hover:text-white hover:bg-white/10"
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

export function DarkToast({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] bg-[#131316] px-4 py-3 min-w-[300px] max-w-[400px] text-white",
        DARK_SHADOWS,
        className
      )}
    >
      {children}
    </div>
  );
}

export { Toaster, toast, dismiss };
