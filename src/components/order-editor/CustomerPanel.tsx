import { useEffect, useState } from "react";
import { Check, Copy, PencilSimple, X } from "@phosphor-icons/react";
import { normalizeBusinessStatus } from "@/lib/orderTransitions";
import { formatTaka } from "@/lib/orderEditor";

export type CustomerDraft = {
  customerName: string;
  phone: string;
  address: string;
};

export type HistoryEntry = {
  id: string;
  order_number?: string | number | null;
  status?: string | null;
  price?: number | null;
  created_at?: string | null;
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
  history?: HistoryEntry[];
  historyLoading?: boolean;
  onApply: (customer: CustomerDraft) => void;
};

function DetailField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">{label}</p>
      <p className="mt-1 break-words text-[14px] text-black">{value || "—"}</p>
    </div>
  );
}

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("en-BD") : null;
}

function historyDateTime(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
  });
}

function historyStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeBusinessStatus(status);
  if (normalized === "confirmed" || normalized === "approved") return "Approved";
  if (normalized === "print") return "Ready to Ship";
  if (normalized === "on_hold" || normalized === "hold") return "On Hold";
  if (normalized === "cancelled" || normalized === "canceled") return "Cancelled";
  if (normalized === "pending") return "Pending";
  if (normalized === "delivered") return "Delivered";
  return (status || "").trim() || "—";
}

function historyStatusPill(status: string | null | undefined): string {
  const normalized = normalizeBusinessStatus(status);
  if (normalized === "confirmed" || normalized === "approved" || normalized === "delivered") return "bg-[#e3f5e9] text-[#2e9e5b]";
  if (normalized === "print") return "bg-[#eceffd] text-[#5b6ee1]";
  if (normalized === "on_hold" || normalized === "hold") return "bg-[#fdf3e3] text-[#b97f1f]";
  if (normalized === "cancelled" || normalized === "canceled") return "bg-[#fdecec] text-[#d05555]";
  return "bg-black/[0.05] text-black/60";
}

const inputClass = "h-12 w-full rounded-lg bg-black/[0.04] px-3.5 text-[14px] text-black outline-none ring-1 ring-inset ring-black/[0.06] transition focus:bg-white focus:ring-black/20 disabled:opacity-50";

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

export function CustomerPanel({ order, customer, disabled = false, history = [], historyLoading = false, onApply }: CustomerPanelProps) {
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
    <section aria-label="Customer and order" className="bg-[#FAFAF8] px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
          <p className="shrink-0 text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">Customer and order</p>
          <h2 className="truncate text-[15px] font-medium text-black">{customer.customerName || "Customer details"}</h2>
        </div>
        {!editing && (
          <button type="button" aria-label="Edit customer" onClick={beginEditing} disabled={disabled} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] text-black/55 transition hover:bg-black/[0.05] disabled:opacity-40">
            <PencilSimple weight="light" size={15} /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-[10px] font-medium uppercase tracking-[0.16em] text-black/45">Customer name<input aria-label="Customer name" value={local.customerName} onChange={(event) => setLocal((current) => ({ ...current, customerName: event.target.value }))} disabled={disabled} className={`${inputClass} mt-2 normal-case tracking-normal`} /></label>
          <label className="block text-[10px] font-medium uppercase tracking-[0.16em] text-black/45">Phone<input aria-label="Phone" type="tel" value={local.phone} onChange={(event) => setLocal((current) => ({ ...current, phone: event.target.value }))} disabled={disabled} className={`${inputClass} mt-2 normal-case tracking-normal`} /></label>
          <label className="block text-[10px] font-medium uppercase tracking-[0.16em] text-black/45 sm:col-span-2">Delivery address<textarea aria-label="Delivery address" value={local.address} onChange={(event) => setLocal((current) => ({ ...current, address: event.target.value }))} disabled={disabled} rows={4} className={`${inputClass} mt-2 h-auto min-h-24 py-2.5 normal-case tracking-normal`} /></label>
          <div className="flex gap-2 pt-1 sm:col-span-2">
            <button type="button" aria-label="Apply customer changes" onClick={applyEditing} disabled={disabled} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-black px-4 text-[13px] text-white disabled:opacity-40"><Check weight="light" size={16} /> Apply</button>
            <button type="button" aria-label="Cancel customer edit" onClick={cancelEditing} disabled={disabled} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-[13px] text-black/55 hover:bg-black/[0.05] disabled:opacity-40"><X weight="light" size={16} /> Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-3">
          <DetailField label="Name" value={customer.customerName} />
          <div className="min-w-0">
            <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">Phone</p>
            <p className="mt-1.5 flex items-center gap-2 text-[15px] text-black">
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

      <div className="mt-4 min-w-0">
        <div className="flex items-center gap-2.5">
          <h3 className="font-['Inter',sans-serif] text-[18px] font-semibold tracking-tight text-black">Last orders</h3>
          {history.length > 0 && (
            <span className="grid h-7 min-w-7 place-items-center rounded-full bg-[#FBBB14] px-1.5 text-[13px] font-bold tabular-nums text-black">{history.length}</span>
          )}
          <span aria-hidden className="flex items-end gap-[3px]">
            <span className="w-1 rounded-full bg-black" style={{ height: 7 }} />
            <span className="w-1 rounded-full bg-black" style={{ height: 11 }} />
            <span className="w-1 rounded-full bg-black" style={{ height: 15 }} />
            <span className="w-1 rounded-full bg-black" style={{ height: 19 }} />
            <span className="w-1 rounded-full bg-black" style={{ height: 23 }} />
          </span>
        </div>
        {historyLoading ? (
          <p className="mt-3 text-[12px] text-black/40">Loading…</p>
        ) : history.length === 0 ? (
          <p className="mt-3 text-[12px] text-black/40">No previous orders.</p>
        ) : (
          <ul className="mt-2.5 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {history.map((entry) => (
              <li key={entry.id} className="min-w-0 rounded-[6px] border border-black/10 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-[17px] font-semibold tracking-normal text-black">{String(entry.order_number ?? "").replace(/^#+/, "")}</p>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium ${historyStatusPill(entry.status)}`}>{historyStatusLabel(entry.status)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[15px] font-bold tabular-nums tracking-[0.02em] text-black">{formatTaka(entry.price)}</p>
                  <p className="min-w-0 truncate text-[13px] text-black/45">{historyDateTime(entry.created_at) || "—"}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-4 mt-4 h-px bg-black/[0.07]" />
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <DetailField label="Payment" value={order.payment_method} />
        <DetailField label="Order total" value={formatTaka(order.price)} />
        <DetailField label="Delivery fee" value={formatTaka(order.delivery_rate)} />
        <DetailField label="Fraud" value={order.fraud_data?.risk_level} />
        <DetailField label="Created" value={dateTime(order.created_at)} />
        <DetailField label="Updated" value={dateTime(order.updated_at)} />
        <DetailField label="Consignment" value={order.consignment_id} />
      </div>
    </section>
  );
}
