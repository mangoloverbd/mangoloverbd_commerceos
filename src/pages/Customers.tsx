import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { buildCustomerExportCsv } from "@/lib/customerExport";
import { MagnifyingGlass, Sparkle, X } from "@phosphor-icons/react";
import { motion, AnimatePresence, useReducedMotion, type Transition } from "framer-motion";
import { Spinner } from "@/components/ui/ios-spinner";
import { toast } from "@/components/ui/sonner";
import { RichButton } from "@/components/ui/rich-button";
import { Select, SelectItem } from "@/components/base/select/select";
import { Button } from "@/components/base/buttons/button";
import { RiDownloadLine } from "@remixicon/react";
import { CustomerDataTable } from "@/components/CustomerDataTable";

type Source = "shopify" | "custom_website" | "manual" | "facebook" | "instagram" | "whatsapp" | "social_inbox";

type Customer = {
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
  customWebsiteCustomers: number;
  shopifyCustomers: number;
};

type AiInsight = { summary: string; riskExplanation: string; nextAction: string };

const sourceLabels: Record<Source, string> = {
  custom_website: "Custom Website",
  shopify: "Shopify",
  manual: "Manual",
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  social_inbox: "Social Inbox",
};

const segmentLabels: Record<string, string> = {
  repeat_buyer: "Repeat Buyer",
  vip: "VIP",
  high_risk: "High Risk",
  inactive: "Inactive",
  new_customer: "New Customer",
};

const lifecycleLabels: Record<Customer["lifecycleStage"], string> = {
  new: "New",
  repeat: "Repeat",
  vip: "VIP",
  dormant: "Dormant",
  risky: "Risky",
};

const campaignLabels: Record<string, string> = {
  all: "All Campaigns",
  cod_guardrail: "COD Guardrail",
  custom_site_retarget: "Custom Site Retarget",
  first_order_nurture: "First Order",
  repeat_upsell: "Repeat Upsell",
  review_request: "Review Request",
  social_retarget: "Social Retarget",
  vip_loyalty: "VIP Loyalty",
  win_back: "Win-back",
};

const sourceOptions = ["all", "custom_website", "facebook", "instagram", "whatsapp", "manual"] as const;
const campaignOptions = ["all", "win_back", "vip_loyalty", "repeat_upsell", "first_order_nurture", "review_request", "social_retarget", "custom_site_retarget", "cod_guardrail"] as const;

const customerPopoverTransition: Transition = {
  type: "spring",
  stiffness: 240,
  damping: 28,
  mass: 0.9,
};

function money(value: number) {
  return `৳${Math.round(value || 0).toLocaleString("en-BD")}`;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-BD", { month: "short", day: "numeric", year: "numeric" });
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="min-h-[92px] rounded-2xl bg-black/[0.04] px-5 py-3"
    >
      <p className="text-[8px] font-medium tracking-[0.3em] text-black/45 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{value}</p>
      <p className="mt-0.5 text-[11px] text-black/40">{sub}</p>
    </motion.div>
  );
}

function CustomerBloomPopover({
  customer,
  insight,
  insightLoading,
  onClose,
  onGenerateInsight,
}: {
  customer: Customer | null;
  insight: AiInsight | null;
  insightLoading: boolean;
  onClose: () => void;
  onGenerateInsight: (customer: Customer) => void;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!customer) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [customer, onClose]);

  const morph = reduce ? { duration: 0.16 } : customerPopoverTransition;

  return (
    <AnimatePresence>
      {customer ? (
        <motion.div
          key="customer-bloom-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.3, ease: "easeOut" } }}
          exit={{ opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }}
          className="fixed inset-0 z-40 grid place-items-center bg-black/12 px-4 backdrop-blur-[3px]"
        >
          <motion.div
            ref={ref}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96, filter: "blur(8px)" }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: morph }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96, filter: "blur(4px)", transition: { duration: 0.2, ease: "easeIn" } }}
            style={{ borderRadius: 18 }}
            className="max-h-[88vh] w-[min(92vw,760px)] overflow-hidden border border-black/10 bg-[#FAFAF8] shadow-2xl shadow-black/15"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: reduce ? 0 : 0.08, duration: 0.2, ease: "easeOut" } }}
              exit={{ opacity: 0, transition: { duration: 0.15, ease: "easeIn" } }}
            >
              <div className="flex items-center justify-between border-b border-black/10 bg-white px-5 py-4">
                <div>
                  <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/35">Customer Profile</p>
                  <h2 className="mt-1 text-[22px] font-bold tracking-tight text-black">{customer.name}</h2>
                  <p className="mt-1 text-[12px] text-black/45">{customer.phone || "No phone"} · {sourceLabels[customer.primarySource]}</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close customer profile"
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-black/35 transition-colors hover:bg-black/[0.04] hover:text-black"
                >
                  <X weight="light" size={18} />
                </button>
              </div>

              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ delay: reduce ? 0 : 0.06, duration: 0.22, ease: "easeOut" }}
                className="max-h-[calc(88vh-89px)] overflow-y-auto p-5"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat label="Orders" value={customer.totalOrders} sub="Total" />
                  <Stat label="Spent" value={money(customer.totalSpent)} sub="LTV" />
                  <Stat label="AOV" value={money(customer.averageOrderValue)} sub="Average" />
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[10px] font-medium text-black/55">{lifecycleLabels[customer.lifecycleStage] || customer.lifecycleStage}</span>
                  {customer.segments.map((segment) => <span key={segment} className="rounded-full bg-black px-2.5 py-1 text-[10px] font-medium text-white">{segmentLabels[segment] || segment}</span>)}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {customer.campaignSegments.map((segment) => <span key={segment} className="rounded-full bg-black/[0.06] px-2.5 py-1 text-[10px] font-medium text-black/55">{campaignLabels[segment] || segment}</span>)}
                </div>

                <RichButton type="button" onClick={() => onGenerateInsight(customer)} className="mt-6 h-10 w-full rounded-[10px] bg-black text-xs text-white shadow-[0_2px_4px_0_rgba(0,0,0,0.16),0_0_0_1px_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.18)] hover:bg-black"><Sparkle weight="light" size={16} /> Generate AI Insight</RichButton>

                {(insightLoading || insight) && (
                  <div className="mt-4 rounded-xl border border-black/10 bg-white p-4">
                    {insightLoading ? <div className="flex items-center gap-2 text-sm text-black/45"><Spinner className="text-black/40" /> Thinking through customer behavior</div> : <div className="space-y-3 text-sm text-black/65"><p>{insight?.summary}</p><p>{insight?.riskExplanation}</p><p className="font-medium text-black">Next: {insight?.nextAction}</p></div>}
                  </div>
                )}

                <div className="mt-6">
                  <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">Timeline</p>
                  <div className="mt-3 grid gap-2">
                    {customer.timeline.map((entry, index) => <div key={`${entry.id}-${index}`} className="rounded-xl border border-black/[0.06] bg-white p-3"><p className="text-xs font-medium text-black">{entry.orderNumber || entry.kind} · {sourceLabels[entry.source]}</p><p className="mt-1 text-xs text-black/45">{entry.product || "No product"} · {money(entry.amount || 0)} · {entry.status}</p><p className="mt-1 text-[10px] text-black/35">{dateLabel(entry.createdAt)}</p></div>)}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source | "all">("all");
  const [campaignFilter, setCampaignFilter] = useState<(typeof campaignOptions)[number]>("all");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [insight, setInsight] = useState<AiInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

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
      return matchesSource && matchesCampaign && matchesQuery;
    });
  }, [campaignFilter, customers, query, source]);

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

  async function generateInsight(customer: Customer) {
    setSelected(customer);
    setInsightLoading(true);
    setInsight(null);
    try {
      const res = await apiFetch("/api/customers/ai-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer }),
      });
      if (!res.ok) throw new Error("Failed to generate AI insight");
      const data = await res.json();
      setInsight(data.insight);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate AI insight");
    } finally {
      setInsightLoading(false);
    }
  }

  return (
    <div className="min-h-full space-y-6 bg-white p-1 lg:p-2">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative space-y-4"
      >
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-sf-display text-[22px] font-bold tracking-tight text-black">Customer Intelligence</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-black/45">Source-aware customer profiles from Shopify, website webhook, manual, and social inbox orders.</p>
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
        <div className="flex items-center gap-2.5 py-3">
          <span className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Customer Queue</span>
          <div className="h-3.5 w-px bg-black/10" />
          <span className="text-[13px] tabular-nums text-muted-foreground">{loading ? "—" : `${filtered.length} customers`}</span>
        </div>

        <div className="flex flex-col gap-3 border-b border-black/[0.07] py-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <MagnifyingGlass weight="light" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers…" className="h-9 w-full rounded-full border-0 bg-black/[0.05] pl-9 pr-3 text-sm outline-none placeholder:text-black/35 focus:ring-1 focus:ring-black/20" />
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Select
              aria-label="Filter by source"
              selectedKey={source}
              onSelectionChange={(key) => setSource(String(key) as Source | "all")}
              className="w-full sm:w-44"
              popoverClassName="min-w-44"
            >
              {sourceOptions.map((item) => (
                <SelectItem key={item} id={item} textValue={item === "all" ? "All Sources" : sourceLabels[item]}>
                  {item === "all" ? "All Sources" : sourceLabels[item]}
                </SelectItem>
              ))}
            </Select>

            <Select
              aria-label="Filter by campaign"
              selectedKey={campaignFilter}
              onSelectionChange={(key) => setCampaignFilter(String(key) as typeof campaignFilter)}
              className="w-full sm:w-48"
              popoverClassName="min-w-48"
            >
              {campaignOptions.map((item) => (
                <SelectItem key={item} id={item} textValue={campaignLabels[item]}>
                  {campaignLabels[item]}
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>

        <div className="pb-6 pt-4">
          <CustomerDataTable customers={filtered} loading={loading} onSelect={(customer) => { setSelected(customer); setInsight(null); }} />
        </div>
      </motion.div>

      <CustomerBloomPopover
        customer={selected}
        insight={insight}
        insightLoading={insightLoading}
        onClose={() => { setSelected(null); setInsight(null); }}
        onGenerateInsight={generateInsight}
      />
    </div>
  );
}
