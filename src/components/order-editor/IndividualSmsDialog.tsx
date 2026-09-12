import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { formatTaka } from "@/lib/orderEditor";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/base/segmented-control/segmented-control";

type IndividualSmsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber?: string | number | null;
  customerName: string;
  phone: string;
  price?: number | null;
  address: string;
};

const MAX_MESSAGE_LENGTH = 1000;

const SMS_TEMPLATES = [
  { id: "custom", label: "Custom", message: "" },
  {
    id: "receive-today",
    label: "Receive today",
    message: "প্রিয় {{customer_name}}, আপনার অর্ডার {{order_number}} আজ ডেলিভারি হবে। অনুগ্রহ করে ফোনটি সচল রাখুন এবং পণ্যটি গ্রহণ করুন। মোট: {{total}}।",
  },
  {
    id: "please-receive",
    label: "Please receive",
    message: "Dear {{customer_name}}, your Mango Lover BD order {{order_number}} is ready for delivery. Please receive the product and pay {{total}} upon delivery. Thank you.",
  },
  {
    id: "courier-unreachable",
    label: "Courier unreachable",
    message: "প্রিয় {{customer_name}}, কুরিয়ার আপনার অর্ডার {{order_number}} নিয়ে আপনাকে পাচ্ছে না। অনুগ্রহ করে কলটি রিসিভ করুন অথবা {{store_phone}}-এ কল করুন।",
  },
  {
    id: "delivery-failed",
    label: "Delivery failed",
    message: "আপনার অর্ডার {{order_number}} আজ ডেলিভারি করা সম্ভব হয়নি। পুনরায় ডেলিভারির জন্য এই নম্বরে কল করুন: {{store_phone}}।",
  },
  {
    id: "address-confirmation",
    label: "Address confirmation",
    message: "প্রিয় {{customer_name}}, অর্ডার {{order_number}} ডেলিভারির ঠিকানা: {{address}}। কোনো পরিবর্তন থাকলে দ্রুত আমাদের জানান।",
  },
  {
    id: "phone-unreachable",
    label: "Phone unreachable",
    message: "আপনার অর্ডার {{order_number}} নিয়ে যোগাযোগ করা যাচ্ছে না। অনুগ্রহ করে {{store_phone}} নম্বরে কল করুন।",
  },
  {
    id: "reschedule-delivery",
    label: "Reschedule",
    message: "আপনার অর্ডার {{order_number}} কবে ডেলিভারি নিতে পারবেন জানালে আমরা পুনরায় ব্যবস্থা করব। রিপ্লাই করুন অথবা কল করুন {{store_phone}}।",
  },
  {
    id: "feedback-request",
    label: "Feedback",
    message: "আপনার অর্ডার {{order_number}} কেমন লেগেছে? আপনার মতামত আমাদের জন্য গুরুত্বপূর্ণ। ধন্যবাদ Mango Lover BD-এর সাথে থাকার জন্য।",
  },
  {
    id: "repeat-purchase",
    label: "Repeat purchase",
    message: "আবার আমের স্বাদ নিতে চাইলে Mango Lover BD-তে অর্ডার করুন। আপনার পছন্দের পণ্য আবার প্রস্তুত আছে।",
  },
  {
    id: "delay-apology",
    label: "Apology",
    message: "প্রিয় {{customer_name}}, অর্ডার {{order_number}} ডেলিভারিতে সাময়িক দেরির জন্য আমরা আন্তরিকভাবে দুঃখিত। আমরা দ্রুত সমাধানের চেষ্টা করছি।",
  },
  {
    id: "cancellation",
    label: "Cancellation",
    message: "আপনার অর্ডার {{order_number}} বাতিল করা হয়েছে। ভবিষ্যতে প্রয়োজন হলে Mango Lover BD-তে আবার অর্ডার করতে পারেন।",
  },
] as const;

type SmsTemplateId = (typeof SMS_TEMPLATES)[number]["id"];

type SmsTemplateValues = {
  customerName: string;
  orderNumber: string | number | null | undefined;
  total?: number | null;
  address: string;
  storePhone: string;
};

function resolveTemplate(message: string, values: SmsTemplateValues) {
  const replacements: Record<string, string> = {
    customer_name: values.customerName || "গ্রাহক",
    order_number: orderLabel(values.orderNumber),
    total: formatTaka(values.total),
    address: values.address || "ডেলিভারি ঠিকানা",
    store_phone: values.storePhone,
  };

  return message.replace(/\{\{([^}]+)\}\}/g, (token, key: string) => replacements[key] || token);
}

function orderLabel(orderNumber: string | number | null | undefined) {
  if (orderNumber == null || orderNumber === "") return "—";
  return `#${String(orderNumber).replace(/^#+/, "")}`;
}

export function IndividualSmsDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  customerName,
  phone,
  price,
  address,
}: IndividualSmsDialogProps) {
  const reduceMotion = useReducedMotion();
  const [message, setMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<SmsTemplateId>("custom");
  const [storePhone, setStorePhone] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setMessage("");
      setSelectedTemplate("custom");
      setError("");
      setSending(false);
    }
  }, [open]);

  function insertValue(value: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? message.length;
    const end = textarea?.selectionEnd ?? message.length;
    const nextMessage = `${message.slice(0, start)}${value}${message.slice(end)}`;
    setMessage(nextMessage);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(start + value.length, start + value.length);
    }, 0);
  }

  async function loadStorePhone() {
    try {
      const response = await apiFetch("/api/storefront/settings");
      if (!response?.ok) return "";
      const data = await response.json().catch(() => ({})) as { settings?: { contactPhone?: string | null } };
      return data.settings?.contactPhone?.trim() || "";
    } catch {
      return "";
    }
  }

  async function selectTemplate(templateId: SmsTemplateId) {
    setSelectedTemplate(templateId);
    setError("");
    if (templateId === "custom") {
      setMessage("");
      return;
    }

    setTemplateLoading(true);
    const template = SMS_TEMPLATES.find((item) => item.id === templateId);
    const requiresStorePhone = Boolean(template?.message.includes("{{store_phone}}"));
    const resolvedStorePhone = requiresStorePhone ? storePhone ?? await loadStorePhone() : storePhone || "";
    if (requiresStorePhone) setStorePhone(resolvedStorePhone);
    setMessage(resolveTemplate(template?.message || "", {
      customerName,
      orderNumber,
      total: price,
      address,
      storePhone: resolvedStorePhone,
    }));
    if (!resolvedStorePhone && template?.message.includes("{{store_phone}}")) {
      setError("Store phone is not configured. Add it in Storefront settings before sending.");
    }
    setTemplateLoading(false);
  }

  async function sendMessage() {
    if (!message.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await apiFetch(`/api/orders/${orderId}/send-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not send SMS");
      toast.success("SMS sent successfully.");
      onOpenChange(false);
    } catch (requestError) {
      const messageText = requestError instanceof Error ? requestError.message : "Could not send SMS";
      setError(messageText);
      toast.error(messageText);
    } finally {
      setSending(false);
    }
  }

  const quickValues = [
    ["Customer name", customerName || "Customer"],
    ["Order number", orderLabel(orderNumber)],
    ["Order total", formatTaka(price)],
    ["Delivery address", address || "the delivery address"],
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        forceMount
        className="data-[state=closed]:pointer-events-none max-w-[520px] rounded-2xl border-black/10 bg-[#FAFAF8] p-5 !duration-0 sm:p-6"
      >
        <AnimatePresence>
          {open && (
            <motion.div
              key="individual-sms-composer"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: "easeOut" }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle className="text-left text-[20px] font-medium tracking-tight text-black">Send individual SMS</DialogTitle>
                <DialogDescription className="text-left text-[12px] text-black/50">
                  Send a one-off message to {customerName || "this customer"} at {phone}. Order {orderLabel(orderNumber)}.
                </DialogDescription>
              </DialogHeader>

              <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:thin]">
                <SegmentedControl
                  aria-label="SMS templates"
                  variant="plain"
                  selectedKeys={new Set([selectedTemplate])}
                  onSelectionChange={(keys) => {
                    const selected = [...keys][0];
                    if (selected) void selectTemplate(String(selected) as SmsTemplateId);
                  }}
                  className="w-max min-w-full justify-start gap-1 rounded-xl bg-black/[0.045] p-1"
                >
                  {SMS_TEMPLATES.map((template) => (
                    <SegmentedControlItem
                      key={template.id}
                      id={template.id}
                      isDisabled={templateLoading}
                      className={({ isSelected }) => [
                        "rounded-lg px-3 py-2 text-[10px] font-medium uppercase tracking-[0.1em]",
                        isSelected ? "bg-white text-black shadow-sm" : "text-black/50 hover:bg-white/50 hover:text-black",
                      ].join(" ")}
                    >
                      {template.label}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5" aria-label="Quick insert values">
                  {quickValues.map(([label, value]) => (
                    <button
                      key={label}
                      type="button"
                      aria-label={`Insert ${label.toLowerCase()}`}
                      onClick={() => insertValue(value)}
                      className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[10px] font-medium text-black/60 transition hover:border-black/20 hover:text-black"
                    >
                      + {label}
                    </button>
                  ))}
                </div>
                <Textarea
                  ref={textareaRef}
                  aria-label="Message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Write your message…"
                  maxLength={MAX_MESSAGE_LENGTH}
                  rows={6}
                  disabled={sending || templateLoading}
                  className="min-h-36 resize-y rounded-xl border-black/10 bg-white text-[13px] leading-6 text-black focus-visible:ring-black/15"
                />
                <div className="flex items-center justify-between gap-3 text-[11px] text-black/40">
                  <span>{error || "The message will be sent through Bulk SMS BD."}</span>
                  <span className="shrink-0 tabular-nums">{[...message].length}/{MAX_MESSAGE_LENGTH}</span>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
                <Button type="button" onClick={() => { void sendMessage(); }} disabled={sending || templateLoading || !message.trim() || (selectedTemplate !== "custom" && message.includes("{{"))}>
                  {sending ? "Sending…" : templateLoading ? "Loading…" : "Send SMS"}
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
