import { UserCircle } from "@phosphor-icons/react";
import { CopyButton } from "@/components/ui/copy-button";
import type { Customer } from "@/pages/Customers";
import { cn } from "@/lib/utils";
import { orderSourceLabel } from "@/lib/orderSource";
import { Checkbox } from "@/components/base/checkbox/checkbox";

type MobileCustomerCardsProps = {
  customers: Customer[];
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  onOpenCustomer?: (customer: Customer) => void;
};

function money(value: number) {
  return `৳${Math.round(value || 0).toLocaleString("en-BD")}`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

export function MobileCustomerCards({ customers, selectedIds, onToggle, onOpenCustomer }: MobileCustomerCardsProps) {
  if (!customers.length) return <div className="px-5 py-20 text-center text-sm text-black/45">No customers match your filters.</div>;

  return (
    <div className="space-y-3" data-testid="mobile-customer-cards">
      {customers.map((customer) => (
        <article
          key={customer.id}
          onClick={(event) => {
            // Selection and phone copy remain separate from opening a profile.
            if ((event.target as HTMLElement).closest("label, button, a")) return;
            if (onOpenCustomer) { onOpenCustomer(customer); return; }
            onToggle(customer.id, !selectedIds.has(customer.id));
          }}
          className={cn(
            "cursor-pointer rounded-2xl border bg-white p-4 transition-colors",
            selectedIds.has(customer.id) ? "border-black/25 bg-black/[0.02]" : "border-black/[0.08]",
          )}
        >
          <div className="flex items-start gap-3">
            <Checkbox
              slot={null}
              aria-label={`Select ${customer.name}`}
              isSelected={selectedIds.has(customer.id)}
              onChange={(checked) => onToggle(customer.id, checked)}
              className="mt-3.5"
            />
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-xs font-semibold text-black/60">{initials(customer.name)}</span>
            <div className="min-w-0 flex-1">
              <a href={`/customers/${encodeURIComponent(customer.id)}`} className="block min-h-6 truncate text-sm font-semibold text-black underline decoration-transparent underline-offset-4 hover:decoration-current focus-visible:outline focus-visible:outline-2" onClick={(event) => {
                event.stopPropagation();
                if (onOpenCustomer && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); onOpenCustomer(customer); }
              }}>{customer.name}</a>
              <div className="mt-1 flex min-w-0 items-center gap-1">
                <p className="truncate text-xs text-black/45">{customer.phone || "No phone"}</p>
                {customer.phone && (
                  <CopyButton
                    value={customer.phone}
                    size="sm"
                    aria-label={`Copy phone number ${customer.phone}`}
                    className="h-6 w-6 shrink-0 rounded-md text-black/40 hover:bg-black/[0.06] hover:text-black"
                  />
                )}
              </div>
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
          <div className="mt-3 flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-black/45"><UserCircle weight="light" size={15} />{orderSourceLabel(customer.primarySource)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
