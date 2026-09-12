import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatTaka } from "@/lib/orderEditor";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

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
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setMessage("");
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
      <DialogContent className="max-w-[520px] rounded-2xl border-black/10 bg-[#FAFAF8] p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-left text-[20px] font-medium tracking-tight text-black">Send individual SMS</DialogTitle>
          <DialogDescription className="text-left text-[12px] text-black/50">
            Send a one-off message to {customerName || "this customer"} at {phone}. Order {orderLabel(orderNumber)}.
          </DialogDescription>
        </DialogHeader>

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
            disabled={sending}
            className="min-h-36 resize-y rounded-xl border-black/10 bg-white text-[13px] leading-6 text-black focus-visible:ring-black/15"
          />
          <div className="flex items-center justify-between gap-3 text-[11px] text-black/40">
            <span>{error || "The message will be sent through Bulk SMS BD."}</span>
            <span className="shrink-0 tabular-nums">{[...message].length}/{MAX_MESSAGE_LENGTH}</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button type="button" onClick={() => { void sendMessage(); }} disabled={sending || !message.trim()}>
            {sending ? "Sending…" : "Send SMS"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
