import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ADVANCE_PAYMENT_METHOD_OPTIONS = [
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "rocket", label: "Rocket" },
  { value: "bank", label: "Bank" },
] as const;

// Optional proof that an advance was received: where it was paid and a TrxID
// or the sender's last 4 digits. Shown under the Advance / partial row.
export function AdvancePaymentProof({
  method,
  reference,
  onMethodChange,
  onReferenceChange,
  disabled = false,
  className,
}: {
  method: string;
  reference: string;
  onMethodChange: (method: string) => void;
  onReferenceChange: (reference: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div data-testid="advance-payment-proof" className={cn("flex items-center justify-between gap-2", className)}>
      <span className="text-[11px] text-black">Paid via</span>
      <span className="flex items-center gap-1.5">
        <Select value={method} onValueChange={onMethodChange} disabled={disabled}>
          <SelectTrigger
            aria-label="Advance paid via"
            className="h-7 w-[92px] rounded-lg border-0 bg-black/[0.04] px-2 text-[12px] shadow-none ring-1 ring-inset ring-black/[0.06]"
          >
            <SelectValue placeholder="Method" />
          </SelectTrigger>
          <SelectContent>
            {ADVANCE_PAYMENT_METHOD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          aria-label="Advance payment reference"
          value={reference}
          maxLength={40}
          placeholder="TrxID / last 4"
          title="Transaction ID, or the last 4 digits of the sender's number"
          onChange={(event) => onReferenceChange(event.target.value.toUpperCase())}
          disabled={disabled}
          className="h-7 w-[118px] rounded-lg bg-black/[0.04] px-2 font-mono text-[12px] uppercase tabular-nums outline-none ring-1 ring-inset ring-black/[0.06] transition placeholder:font-sans placeholder:normal-case placeholder:text-black/30 focus:bg-white focus:ring-black/20 disabled:opacity-40"
        />
      </span>
    </div>
  );
}
