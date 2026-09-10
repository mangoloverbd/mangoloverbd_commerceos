import { ArrowRight, UserCircle } from "@phosphor-icons/react";
import type { Customer } from "@/pages/Customers";
import { cn } from "@/lib/utils";

type MobileCustomerCardsProps = {
  customers: Customer[];
  onSelect: (customer: Customer) => void;
};

function money(value: number) {
  return `৳${Math.round(value || 0).toLocaleString("en-BD")}`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

export function MobileCustomerCards({ customers, onSelect }: MobileCustomerCardsProps) {
  if (!customers.length) return <div className="px-5 py-20 text-center text-sm text-black/45">No customers match your filters.</div>;

  return (
    <div className="space-y-3" data-testid="mobile-customer-cards">
      {customers.map((customer) => (
        <article key={customer.id} className="rounded-2xl border border-black/[0.08] bg-white p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-xs font-semibold text-black/60">{initials(customer.name)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-black">{customer.name}</p>
              <p className="mt-1 truncate text-xs text-black/45">{customer.phone || "No phone"}</p>
            </div>
            <span className={cn("rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-wide", customer.riskLevel === "high" ? "bg-red-50 text-red-600" : customer.riskLevel === "medium" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>
              {customer.riskLevel} risk
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-black/[0.06] pt-3 text-center">
            <div><p className="text-[9px] uppercase tracking-[0.16em] text-black/40">Orders</p><p className="mt-1 text-sm font-semibold tabular-nums text-black">{customer.totalOrders}</p></div>
            <div><p className="text-[9px] uppercase tracking-[0.16em] text-black/40">Spent</p><p className="mt-1 text-sm font-semibold tabular-nums text-black">{money(customer.totalSpent)}</p></div>
            <div><p className="text-[9px] uppercase tracking-[0.16em] text-black/40">Stage</p><p className="mt-1 truncate text-sm font-semibold capitalize text-black">{customer.lifecycleStage}</p></div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-black/45"><UserCircle weight="light" size={15} />{customer.primarySource.replaceAll("_", " ")}</span>
            <button type="button" onClick={() => onSelect(customer)} className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-black hover:bg-black/[0.05]" aria-label={`Open customer ${customer.name}`}>View profile <ArrowRight weight="light" size={15} /></button>
          </div>
        </article>
      ))}
    </div>
  );
}
