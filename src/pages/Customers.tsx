import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { buildCustomerExportCsv } from "@/lib/customerExport";
import { MagnifyingGlass, Package, X } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/components/ui/sonner";
import { Select, SelectItem } from "@/components/base/select/select";
import { Button } from "@/components/base/buttons/button";
import { RiDownloadLine } from "@remixicon/react";
import { CustomerDataTable, type CustomerTableView } from "@/components/CustomerDataTable";
import { CustomerSmsDialog } from "@/components/CustomerSmsDialog";
import SmsBubbleIcon from "@/components/SmsBubbleIcon";
import { DateRangePicker } from "@/components/DateRangePicker";
import { customerOrderedInRange } from "@/lib/customerDateFilter";
import { ORDER_SOURCE_OPTIONS, type OrderSource } from "@/lib/orderSource";
import type { DateRange } from "react-day-picker";

export type Source = OrderSource;

export type Customer = {
  id: string;
  name: string;
  phone: string;
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  sources: Source[];
  primarySource: Source;
  riskLevel: "low" | "medium" | "high";
  segments: string[];
  lifecycleStage: "new" | "repeat" | "vip" | "dormant" | "risky";
  campaignSegments: string[];
  lastOrderAt: string | null;
  timeline: Array<{
    id?: string;
    kind: string;
    source: Source;
    orderNumber?: string;
    product?: string;
    amount?: number;
    status?: string;
    createdAt?: string | null;
  }>;
};

type CustomerSummary = {
  totalCustomers: number;
  repeatBuyers: number;
  vipCustomers: number;
  highRiskCustomers: number;
  websiteCustomers: number;
};

const campaignLabels: Record<string, string> = {
  all: "All Campaigns",
  cod_guardrail: "COD Guardrail",
  custom_site_retarget: "Website Retarget",
  first_order_nurture: "First Order",
  repeat_upsell: "Repeat Upsell",
  review_request: "Review Request",
  social_retarget: "Social Retarget",
  vip_loyalty: "VIP Loyalty",
  win_back: "Win-back",
};

const campaignOptions = ["all", "win_back", "vip_loyalty", "repeat_upsell", "first_order_nurture", "review_request", "social_retarget", "custom_site_retarget", "cod_guardrail"] as const;

function Stat({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="min-h-[92px] rounded-2xl bg-black/[0.04] px-5 py-3"
    >
      <p className="text-[8px] font-medium tracking-[0.3em] text-black uppercase">{label}</p>
      <p className="mt-1 text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{value}</p>
      <p className="mt-0.5 text-[11px] text-black">{sub}</p>
    </motion.div>
  );
}

// Right padding that moves the dropdown arrow left so the reset × sits beside it, not on it.
const RESET_ROOM = "pr-10";

/** Wraps a filter so it shows a reset × while it is not on its "all" value, like the date picker. */
function ResettableFilter({ label, active, onReset, children }: { label: string; active: boolean; onReset: () => void; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      {active && (
        <button
          type="button"
          aria-label={`Reset ${label}`}
          onClick={onReset}
          className="absolute right-2 top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-foreground/50 transition-colors hover:bg-black/[0.05] hover:text-foreground"
        >
          <X weight="light" size={14} />
        </button>
      )}
    </div>
  );
}

type ProductOption = { name: string; imageUrl: string | null };

function ProductThumb({ imageUrl }: { imageUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/[0.06]">
      {imageUrl && !failed
        ? <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />
        : <Package weight="light" size={14} className="text-black/40" />}
    </span>
  );
}

export default function Customers() {
  const location = useLocation();
  const navigate = useNavigate();
  const restored = location.state?.customerListState as { query?: string; source?: Source | "all"; campaignFilter?: (typeof campaignOptions)[number]; productFilter?: string; dateRange?: DateRange | null; tableView?: CustomerTableView; selectedIds?: string[] } | undefined;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(restored?.query || "");
  const [source, setSource] = useState<Source | "all">(restored?.source || "all");
  const [campaignFilter, setCampaignFilter] = useState<(typeof campaignOptions)[number]>(restored?.campaignFilter || "all");
  const [productFilter, setProductFilter] = useState(restored?.productFilter || "all");
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | null>(restored?.dateRange || null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(restored?.selectedIds || []));
  const [smsOpen, setSmsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch("/api/customers");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load customers");
        if (!cancelled) {
          setCustomers(data.customers || []);
          setSummary(data.summary || null);
        }
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Failed to load customers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/products")
      .then((res) => (res.ok ? res.json() : { products: [] }))
      .then((data: { products?: Array<{ name?: string | null; image_url?: string | null }> }) => {
        if (cancelled) return;
        const byName = new Map<string, ProductOption>();
        for (const product of data.products || []) {
          const name = product.name?.trim();
          if (name && !byName.has(name)) byName.set(name, { name, imageUrl: product.image_url || null });
        }
        setProductOptions([...byName.values()].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {
        // The product filter is optional; the customer list still works without it.
      });
    return () => { cancelled = true; };
  }, []);

  // Only offer sources this workspace has actually received orders from.
  const sourceOptions = useMemo(() => {
    const used = new Set(customers.flatMap((customer) => customer.sources));
    return ORDER_SOURCE_OPTIONS.filter((option) => used.has(option.value));
  }, [customers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesSource = source === "all" || customer.sources.includes(source);
      const matchesCampaign = campaignFilter === "all" || customer.campaignSegments.includes(campaignFilter);
      const matchesQuery = !q || [
        customer.name,
        customer.phone,
        customer.primarySource,
        customer.lifecycleStage,
        ...customer.segments,
        ...customer.campaignSegments,
      ].join(" ").toLowerCase().includes(q);
      return matchesSource && matchesCampaign && matchesQuery && customerOrderedInRange(customer, dateRange, productFilter === "all" ? null : productFilter);
    });
  }, [campaignFilter, customers, dateRange, productFilter, query, source]);

  // Only customers still visible under the current filters count as selected.
  const selectedCustomers = useMemo(() => filtered.filter((customer) => selectedIds.has(customer.id)), [filtered, selectedIds]);
  const smsRecipients = useMemo(() => selectedCustomers.filter((customer) => customer.phone), [selectedCustomers]);

  const winBackCount = useMemo(() => customers.filter((customer) => customer.campaignSegments.includes("win_back")).length, [customers]);

  function exportFilteredCustomers() {
    if (!filtered.length) {
      toast.error("No customers to export");
      return;
    }
    const csv = buildCustomerExportCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `customer-audience-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} customers`);
  }

  return (
    <div className="min-h-full space-y-6 bg-white p-1 max-md:p-2 lg:p-2">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative space-y-4"
      >
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-sf-display text-[22px] font-bold tracking-tight text-black">Customer Intelligence</h1>
            <p className="mt-1 text-[13px] text-black">Click a customer to view their profile. Use the checkboxes to select an SMS audience.</p>
          </div>
          <Button variant="ghost" size="medium" leadingIcon={RiDownloadLine} onClick={exportFilteredCustomers}>
            Export Audience
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total" value={summary?.totalCustomers ?? 0} sub="Detected customers" />
          <Stat label="Repeat" value={summary?.repeatBuyers ?? 0} sub="Bought more than once" />
          <Stat label="Win-back" value={winBackCount} sub="Dormant audience" />
          <Stat label="Risk" value={summary?.highRiskCustomers ?? 0} sub="Need confirmation" />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="overflow-hidden rounded-2xl bg-white"
      >
        <div className="flex min-h-14 items-center gap-2.5 py-3">
          <span className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Customer Queue</span>
          <div className="h-3.5 w-px bg-black/10" />
          <span className="text-[13px] tabular-nums text-muted-foreground">{loading ? "—" : `${filtered.length} customers`}</span>
          <AnimatePresence initial={false}>
            {selectedCustomers.length > 0 && (
              <motion.div
                key="customer-selection-actions"
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="ml-auto flex items-center gap-3"
              >
                <span className="text-[13px] tabular-nums text-black">{selectedCustomers.length} selected</span>
                <button type="button" onClick={() => setSelectedIds(new Set())} className="text-[12px] text-black/55 underline-offset-2 hover:text-black hover:underline">Clear</button>
                <Button variant="primary" size="small" onClick={() => setSmsOpen(true)} leadingIcon={SmsBubbleIcon}>
                  Send SMS
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-3 border-b border-black/[0.07] py-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <MagnifyingGlass weight="light" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers…" className="h-9 w-full rounded-full border-0 bg-black/[0.05] pl-9 pr-3 text-sm outline-none placeholder:text-black/35 focus:ring-1 focus:ring-black/20" />
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <DateRangePicker value={dateRange} onChange={setDateRange} placement="bottom" variant="toolbar" />

            <ResettableFilter label="source filter" active={source !== "all"} onReset={() => setSource("all")}>
              <Select
                aria-label="Filter by source"
                selectedKey={source}
                onSelectionChange={(key) => setSource(String(key) as Source | "all")}
                className="w-full sm:w-44"
                triggerClassName={source !== "all" ? RESET_ROOM : undefined}
                popoverClassName="min-w-44"
              >
                <SelectItem id="all" textValue="All Sources">All Sources</SelectItem>
                {sourceOptions.map((option) => (
                  <SelectItem key={option.value} id={option.value} textValue={option.label}>
                    {option.label}
                  </SelectItem>
                ))}
              </Select>
            </ResettableFilter>

            <ResettableFilter label="product filter" active={productFilter !== "all"} onReset={() => setProductFilter("all")}>
              <Select
                aria-label="Filter by product"
                selectedKey={productFilter}
                onSelectionChange={(key) => setProductFilter(String(key))}
                className="w-full sm:w-52"
                triggerClassName={productFilter !== "all" ? RESET_ROOM : undefined}
                popoverClassName="min-w-80"
              >
                <SelectItem id="all" textValue="All Products">All Products</SelectItem>
                {productOptions.map((product) => (
                  <SelectItem key={product.name} id={product.name} textValue={product.name}>
                    <ProductThumb imageUrl={product.imageUrl} />
                    <span className="truncate">{product.name}</span>
                  </SelectItem>
                ))}
              </Select>
            </ResettableFilter>

            <ResettableFilter label="campaign filter" active={campaignFilter !== "all"} onReset={() => setCampaignFilter("all")}>
              <Select
                aria-label="Filter by campaign"
                selectedKey={campaignFilter}
                onSelectionChange={(key) => setCampaignFilter(String(key) as typeof campaignFilter)}
                className="w-full sm:w-48"
                triggerClassName={campaignFilter !== "all" ? RESET_ROOM : undefined}
                popoverClassName="min-w-48"
              >
                {campaignOptions.map((item) => (
                  <SelectItem key={item} id={item} textValue={campaignLabels[item]}>
                    {campaignLabels[item]}
                  </SelectItem>
                ))}
              </Select>
            </ResettableFilter>
          </div>
        </div>

        <div className="pb-6 pt-4">
          <CustomerDataTable
            customers={filtered}
            loading={loading}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            initialView={restored?.tableView}
            onOpenCustomer={(customer, tableView) => {
              const customerListState = { query, source, campaignFilter, productFilter, dateRange, tableView, selectedIds: [...selectedIds] };
              // Also replace the current entry's state so browser Back restores
              // the queue, not only the profile's explicit Customers link.
              navigate(location.pathname, { replace: true, state: { customerListState } });
              navigate(`/customers/${encodeURIComponent(customer.id)}`, { state: { customerListState } });
            }}
          />
        </div>
      </motion.div>

      <CustomerSmsDialog
        open={smsOpen}
        onOpenChange={setSmsOpen}
        recipients={smsRecipients}
        withoutPhone={selectedCustomers.length - smsRecipients.length}
        onSent={() => setSelectedIds(new Set())}
      />

    </div>
  );
}
