import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import {
  CUSTOMER_SMS_TEMPLATES,
  MAX_CUSTOMER_SMS_LENGTH,
  MAX_CUSTOMER_SMS_RECIPIENTS,
  smsSegments,
  type CustomerSmsTemplateId,
} from "@/lib/customerSms";
import { DEFAULT_STORE_PHONE } from "@/components/order-editor/IndividualSmsDialog";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";

type Recipient = { id: string; name: string };

type CustomerSmsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: Recipient[];
  withoutPhone: number;
  onSent: () => void;
};

const NAME_TOKEN = "{{customer_name}}";

const fillName = (text: string, name: string) => text.split(NAME_TOKEN).join(displayName(name));

function displayName(name: string) {
  const trimmed = name.trim();
  return trimmed && trimmed.toLowerCase() !== "unknown" ? trimmed : "গ্রাহক";
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

export function CustomerSmsDialog({ open, onOpenChange, recipients, withoutPhone, onSent }: CustomerSmsDialogProps) {
  const reduceMotion = useReducedMotion();
  const [message, setMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<CustomerSmsTemplateId>("custom");
  const [storePhone, setStorePhone] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setMessage("");
      setSelectedTemplate("custom");
      setConfirming(false);
      setSending(false);
      setError("");
    }
  }, [open]);

  const credits = useMemo(
    () => recipients.reduce((sum, recipient) => sum + smsSegments(fillName(message, recipient.name)), 0),
    [message, recipients],
  );
  const preview = recipients[0] ? fillName(message, recipients[0].name) : message;
  const overLimit = recipients.length > MAX_CUSTOMER_SMS_RECIPIENTS;
  const unfilled = /\{\{(?!customer_name\}\})/.test(message);
  const canSend = Boolean(message.trim()) && recipients.length > 0 && !overLimit && !unfilled && !sending;

  async function selectTemplate(templateId: CustomerSmsTemplateId) {
    setSelectedTemplate(templateId);
    setError("");
    const template = CUSTOMER_SMS_TEMPLATES.find((item) => item.id === templateId);
    let text: string = template?.message ?? "";
    if (text.includes("{{store_phone}}")) {
      const phone = storePhone ?? ((await loadStorePhone()) || DEFAULT_STORE_PHONE);
      setStorePhone(phone);
      text = text.split("{{store_phone}}").join(phone);
    }
    setMessage(text);
  }

  function insertName() {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? message.length;
    const end = textarea?.selectionEnd ?? message.length;
    setMessage(`${message.slice(0, start)}${NAME_TOKEN}${message.slice(end)}`);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(start + NAME_TOKEN.length, start + NAME_TOKEN.length);
    }, 0);
  }

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError("");
    try {
      const response = await apiFetch("/api/customers/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerIds: recipients.map((recipient) => recipient.id), message }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string | null; sent?: number; failed?: number };
      if (!response.ok) throw new Error(data.error || "Could not send SMS");
      const sent = data.sent ?? 0;
      const failed = data.failed ?? 0;
      if (failed > 0) {
        toast.error(`Sent ${sent}, ${failed} failed${data.error ? `: ${data.error}` : ""}`);
      } else {
        toast.success(`SMS sent to ${sent} ${sent === 1 ? "customer" : "customers"}`);
      }
      onSent();
      onOpenChange(false);
    } catch (requestError) {
      const text = requestError instanceof Error ? requestError.message : "Could not send SMS";
      setError(text);
      setConfirming(false);
      toast.error(text);
    } finally {
      setSending(false);
    }
  }

  const audience = `${recipients.length.toLocaleString("en-BD")} ${recipients.length === 1 ? "customer" : "customers"}`;
  const status = error
    || (overLimit ? `Select up to ${MAX_CUSTOMER_SMS_RECIPIENTS} customers per send.` : "")
    || (unfilled ? "Replace every {{…}} placeholder before sending." : "")
    || (withoutPhone > 0 ? `${withoutPhone} selected ${withoutPhone === 1 ? "customer has" : "customers have"} no phone and will be skipped.` : "")
    || "Each customer gets their own message through Bulk SMS BD.";

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!sending) onOpenChange(next); }}>
      <DialogContent
        forceMount
        overlayClassName="bg-black/45 backdrop-blur-sm"
        className="data-[state=closed]:pointer-events-none max-w-[560px] rounded-2xl border-black/10 bg-[#FAFAF8] p-5 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.35)] !duration-0 sm:p-6"
      >
        <AnimatePresence>
          {open && (
            <motion.div
              key="customer-sms-composer"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: "easeOut" }}
              className="min-w-0 space-y-4"
            >
              <DialogHeader className="pr-8">
                <DialogTitle className="text-left text-[20px] font-medium tracking-tight text-black">Send SMS to {audience}</DialogTitle>
                <DialogDescription className="text-left text-[12px] leading-5 text-black">
                  Pick a template or write your own. {NAME_TOKEN} becomes each customer's name.
                </DialogDescription>
              </DialogHeader>

              {confirming ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-black/10 bg-white p-4">
                    <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Preview for {displayName(recipients[0]?.name ?? "")}</p>
                    <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-black">{preview}</p>
                  </div>
                  <p className="text-[13px] text-black">
                    Send to <b className="font-medium">{audience}</b>, using about <b className="font-medium tabular-nums">{credits.toLocaleString("en-BD")}</b> SMS credits? This can't be undone.
                  </p>
                </div>
              ) : (
                <>
                  <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:thin]">
                    <SegmentedControl
                      aria-label="SMS templates"
                      variant="plain"
                      selectedKeys={new Set([selectedTemplate])}
                      onSelectionChange={(keys) => {
                        const selected = [...keys][0];
                        if (selected) void selectTemplate(String(selected) as CustomerSmsTemplateId);
                      }}
                      className="w-max min-w-full justify-start gap-1 rounded-xl bg-black/[0.045] p-1"
                    >
                      {CUSTOMER_SMS_TEMPLATES.map((template) => (
                        <SegmentedControlItem
                          key={template.id}
                          id={template.id}
                          className={({ isSelected }) => [
                            "whitespace-nowrap rounded-lg px-3 py-2 text-[10px] font-medium uppercase tracking-[0.1em]",
                            isSelected ? "bg-white text-black shadow-sm" : "text-black hover:bg-white/50 hover:text-black",
                          ].join(" ")}
                        >
                          {template.label}
                        </SegmentedControlItem>
                      ))}
                    </SegmentedControl>
                  </div>

                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={insertName}
                      className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[10px] font-medium text-black transition hover:border-black/20"
                    >
                      + Customer name
                    </button>
                    <Textarea
                      ref={textareaRef}
                      aria-label="Message"
                      value={message}
                      onChange={(event) => { setMessage(event.target.value); setSelectedTemplate("custom"); }}
                      placeholder="Write your message…"
                      maxLength={MAX_CUSTOMER_SMS_LENGTH}
                      rows={6}
                      className="min-h-36 w-full min-w-0 resize-y rounded-xl border-black/10 bg-white text-[13px] leading-6 text-black focus-visible:ring-black/15"
                    />
                    <div className="flex items-center justify-between gap-3 text-[11px] text-black">
                      <span className={`min-w-0 ${error || overLimit || unfilled ? "text-[#B4473A]" : ""}`}>{status}</span>
                      <span className="shrink-0 tabular-nums">{[...message].length}/{MAX_CUSTOMER_SMS_LENGTH}</span>
                    </div>
                  </div>
                </>
              )}

              <DialogFooter className="items-center gap-2 sm:gap-2">
                {!confirming && message.trim() && (
                  <span className="mr-auto text-[11px] tabular-nums text-black/60">≈ {credits.toLocaleString("en-BD")} SMS credits</span>
                )}
                {confirming ? (
                  <>
                    <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={sending}>Back</Button>
                    <Button type="button" onClick={() => { void send(); }} disabled={!canSend}>
                      {sending ? "Sending…" : `Send to ${audience}`}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="button" onClick={() => setConfirming(true)} disabled={!canSend}>Review &amp; send</Button>
                  </>
                )}
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
