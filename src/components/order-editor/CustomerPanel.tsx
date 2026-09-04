import { useEffect, useState } from "react";
import { Check, PencilSimple, X } from "@phosphor-icons/react";
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

export function CustomerPanel({ order, customer, disabled = false, onApply }: CustomerPanelProps) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(customer);

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
          <DetailField label="Phone" value={customer.phone} />
          <DetailField label="Delivery address" value={customer.address} />
        </div>
      )}

      <div className="my-6 h-px bg-black/[0.07]" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <DetailField label="Status" value={order.status} />
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
