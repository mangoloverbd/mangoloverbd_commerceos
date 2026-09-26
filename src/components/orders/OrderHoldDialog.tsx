import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OrderHoldFields, type OrderHoldMetadata } from "@/components/orders/OrderHoldFields";
import { Spinner } from "@/components/ui/ios-spinner";
import { validateOrderHoldDetails } from "../../../shared/orderHold.js";

type OrderHoldDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  onSubmit: (metadata: OrderHoldMetadata) => Promise<boolean> | boolean;
};

const EMPTY_HOLD_DETAILS: OrderHoldMetadata = {
  hold_reason_code: null,
  hold_reason_detail: null,
  hold_until_date: null,
};

export function OrderHoldDialog({ open, onOpenChange, title, submitLabel, onSubmit }: OrderHoldDialogProps) {
  const [metadata, setMetadata] = useState<OrderHoldMetadata>(EMPTY_HOLD_DETAILS);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dialogContainer, setDialogContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setMetadata(EMPTY_HOLD_DETAILS);
    setError("");
  }, [open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateOrderHoldDetails({
      reasonCode: metadata.hold_reason_code,
      reasonDetail: metadata.hold_reason_detail ?? "",
      holdUntilDate: metadata.hold_until_date,
    });
    if (validationError) {
      setError(validationError.error);
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      if (await onSubmit(metadata)) onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={setDialogContainer} className="max-w-md rounded-xl border-black/10 bg-[#FAFAF8] p-5">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>একটি কারণ নির্বাচন করুন। সাধারণ নোট পরিবর্তন হবে না।</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <OrderHoldFields
            value={metadata}
            onChange={setMetadata}
            disabled={submitting}
            popoverPortalContainer={dialogContainer ?? undefined}
          />
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          <DialogFooter className="mt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm text-black/70 hover:bg-black/[0.05] disabled:opacity-50"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-black px-4 text-sm text-white disabled:opacity-50"
            >
              {submitting && <Spinner size="sm" />}
              {submitLabel}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
