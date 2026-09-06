import { useEffect, useState } from "react";
import { Check, Copy, PencilSimple, X } from "@phosphor-icons/react";
import { Select as BuiSelect, SelectItem as BuiSelectItem } from "@/components/base/select/select";
import { Spinner } from "@/components/ui/ios-spinner";
import { canEnterPrint, isPrintStatus } from "@/lib/orderTransitions";
import { formatTaka } from "@/lib/orderEditor";

export type CustomerDraft = {
  customerName: string;
  phone: string;
  address: string;
};

type CustomerOrder = {
  status?: string | null;
  payment_method?: string | null;
  delivery_rate?: number | null;
  price?: number | null;
  courier_name?: string | null;
  courier_status?: string | null;
  consignment_id?: string | null;
  fraud_data?: { risk_level?: string } | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CustomerPanelProps = {
  order: CustomerOrder;
  customer: CustomerDraft;
  disabled?: boolean;
  onApply: (customer: CustomerDraft) => void;
  onStatusChange: (nextStatus: string) => void;
  statusPending?: boolean;
};

function DetailField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">{label}</p>
      <p className="mt-1 break-words text-[13px] text-black">{value || "—"}</p>
    </div>
  );
}

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("en-BD") : null;
}

const inputClass = "h-10 w-full rounded-lg bg-black/[0.04] px-3 text-[13px] text-black outline-none ring-1 ring-inset ring-black/[0.06] transition focus:bg-white focus:ring-black/20 disabled:opacity-50";

function statusOptionsFor(status: string | null | undefined): string[] {
  if (isPrintStatus(status)) return ["print", "confirmed", "cancelled"];
  if (canEnterPrint(status)) return ["pending", "confirmed", "print", "cancelled"];
  return ["pending", "confirmed", "cancelled"];
}

async function copyTextToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    if (typeof document.execCommand === "function") {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    }
    return false;
  } catch {
    return false;
  }
}

export function CustomerPanel({ order, customer, disabled = false, onApply, onStatusChange, statusPending = false }: CustomerPanelProps) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(customer);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!editing) setLocal(customer);
  }, [customer, editing]);

  function beginEditing() {
    setLocal(customer);
    setEditing(true);
  }

  function cancelEditing() {
    setLocal(customer);
    setEditing(false);
  }

  function applyEditing() {
    onApply({
      customerName: local.customerName.trim(),
      phone: local.phone.trim(),
      address: local.address.trim(),
    });
    setEditing(false);
  }

  async function copyPhone() {
    const value = customer.phone.trim();
    if (!value || copied) return;
    if (await copyTextToClipboard(value)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <section aria-label="Customer and order" className="flex min-h-0 flex-col bg-[#FAFAF8] p-5 xl:overflow-y-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">Customer and order</p>
          <h2 className="mt-2 text-xl font-light text-black">Customer details</h2>
        </div>
        {!editing && (
          <button type="button" aria-label="Edit customer" onClick={beginEditing} disabled={disabled} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] text-black/55 transition hover:bg-black/[0.05] disabled:opacity-40">
            <PencilSimple weight="light" size={15} /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-5 space-y-3">
          <label className="block text-[10px] font-medium uppercase tracking-[0.16em] text-black/45">Customer name<input aria-label="Customer name" value={local.customerName} onChange={(event) => setLocal((current) => ({ ...current, customerName: event.target.value }))} disabled={disabled} className={`${inputClass} mt-1.5 normal-case tracking-normal`} /></label>
          <label className="block text-[10px] font-medium uppercase tracking-[0.16em] text-black/45">Phone<input aria-label="Phone" type="tel" value={local.phone} onChange={(event) => setLocal((current) => ({ ...current, phone: event.target.value }))} disabled={disabled} className={`${inputClass} mt-1.5 normal-case tracking-normal`} /></label>
          <label className="block text-[10px] font-medium uppercase tracking-[0.16em] text-black/45">Delivery address<textarea aria-label="Delivery address" value={local.address} onChange={(event) => setLocal((current) => ({ ...current, address: event.target.value }))} disabled={disabled} rows={3} className={`${inputClass} mt-1.5 h-auto min-h-20 py-2 normal-case tracking-normal`} /></label>
          <div className="flex gap-2 pt-1">
            <button type="button" aria-label="Apply customer changes" onClick={applyEditing} disabled={disabled} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-black px-3 text-[12px] text-white disabled:opacity-40"><Check weight="light" size={15} /> Apply</button>
            <button type="button" aria-label="Cancel customer edit" onClick={cancelEditing} disabled={disabled} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] text-black/55 hover:bg-black/[0.05] disabled:opacity-40"><X weight="light" size={15} /> Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <DetailField label="Name" value={customer.customerName} />
          <div className="min-w-0">
            <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">Phone</p>
            <p className="mt-1 flex items-center gap-2 text-[13px] text-black">
              <span className="break-words">{customer.phone || "—"}</span>
              {customer.phone.trim() && (
                <button
                  type="button"
                  aria-label={copied ? "Phone number copied" : "Copy phone number"}
                  onClick={() => { void copyPhone(); }}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-black/45 transition hover:bg-black/[0.06] hover:text-black"
                >
                  {copied ? <Check weight="light" size={15} /> : <Copy weight="light" size={15} />}
                </button>
              )}
            </p>
          </div>
          <DetailField label="Delivery address" value={customer.address} />
        </div>
      )}

      <div className="my-6 h-px bg-black/[0.07]" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <div className="min-w-0">
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">Status</p>
          <div className="mt-1.5 flex items-center gap-2">
            <BuiSelect
              aria-label="Order status"
              selectedKey={order.status ?? null}
              onSelectionChange={(key) => onStatusChange(String(key))}
              isDisabled={disabled || statusPending}
              triggerClassName="h-9 capitalize"
            >
              {statusOptionsFor(order.status).map((st) => (
                <BuiSelectItem key={st} id={st} textValue={st}>{st}</BuiSelectItem>
              ))}
            </BuiSelect>
            {statusPending && <Spinner size="sm" className="shrink-0 text-black/40" />}
          </div>
        </div>
        <DetailField label="Payment" value={order.payment_method} />
        <DetailField label="Order total" value={formatTaka(order.price)} />
        <DetailField label="Delivery fee" value={formatTaka(order.delivery_rate)} />
        <DetailField label="Courier" value={order.courier_name || order.courier_status} />
        <DetailField label="Fraud" value={order.fraud_data?.risk_level} />
        <DetailField label="Created" value={dateTime(order.created_at)} />
        <DetailField label="Updated" value={dateTime(order.updated_at)} />
        <DetailField label="Consignment" value={order.consignment_id} />
      </div>
    </section>
  );
}
