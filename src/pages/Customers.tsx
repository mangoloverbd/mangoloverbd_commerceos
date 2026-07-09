import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { MagnifyingGlass, Sparkle, UsersThree, X } from "@phosphor-icons/react";
import { motion, AnimatePresence, useReducedMotion, type Transition } from "framer-motion";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import { toast } from "@/components/ui/sonner";
import { RichButton } from "@/components/ui/rich-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/motion-tabs";

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

const sourceOptions = ["all", "shopify", "custom_website", "facebook", "instagram", "whatsapp", "manual"] as const;

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
      className="min-h-[112px] rounded-xl border border-black/10 bg-white px-5 py-4"
    >
      <p className="text-[8px] font-medium tracking-[0.3em] text-black/45 uppercase">{label}</p>
      <p className="mt-2 text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{value}</p>
      <p className="mt-1 text-[11px] text-black/40">{sub}</p>
    </motion.div>
  );
}

function CustomersTable({ customers, loading, onSelect }: { customers: Customer[]; loading: boolean; onSelect: (customer: Customer) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
      <div className="grid grid-cols-[1.5fr_0.9fr_0.8fr_0.8fr_0.8fr] border-b border-black/10 px-6 py-3 text-[8px] font-medium uppercase tracking-[0.25em] text-black/35 max-lg:hidden">
        <span>Customer</span><span>Source</span><span>Orders</span><span>Spent</span><span>Risk</span>
      </div>
      {loading ? (
        <div className="flex h-56 items-center justify-center"><Spinner className="text-black/40" /></div>
      ) : customers.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center gap-3 text-center text-black/35"><UsersThree weight="light" size={34} /><p className="text-[13px]">No customers match this filter.</p></div>
      ) : customers.map((customer, index) => (
        <motion.button
          key={customer.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: index * 0.025 }}
          onClick={() => onSelect(customer)}
          className="grid w-full grid-cols-1 gap-3 border-b border-black/[0.06] px-6 py-4 text-left transition-colors last:border-0 hover:bg-black/[0.025] lg:grid-cols-[1.5fr_0.9fr_0.8fr_0.8fr_0.8fr] lg:items-center"
        >
          <div>
            <p className="text-[13px] font-medium text-black">{customer.name}</p>
            <p className="mt-1 text-[11px] text-black/40">{customer.phone || "No phone"} · Last order {dateLabel(customer.lastOrderAt)}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">{customer.sources.map((item) => <span key={item} className="rounded-full bg-black/[0.05] px-2 py-1 text-[10px] text-black/50">{sourceLabels[item]}</span>)}</div>
          <p className="text-[13px] tabular-nums text-black/65">{customer.totalOrders}</p>
          <p className="text-[13px] tabular-nums text-black/65">{money(customer.totalSpent)}</p>
          <p className={cn("text-[11px] font-medium capitalize", customer.riskLevel === "high" ? "text-red-600" : customer.riskLevel === "medium" ? "text-amber-600" : "text-emerald-700")}>{customer.riskLevel}</p>
        </motion.button>
      ))}
    </div>
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
    <AnimatePresence initial={false} mode="popLayout">
      {customer ? (
        <motion.div
          key="customer-bloom-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed inset-0 z-40 grid place-items-center bg-black/12 px-4 backdrop-blur-[3px]"
        >
          <motion.div
            ref={ref}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97, filter: "blur(6px)" }}
            transition={morph}
            style={{ borderRadius: 18 }}
            className="max-h-[88vh] w-[min(92vw,760px)] overflow-hidden border border-black/10 bg-[#FAFAF8] shadow-2xl shadow-black/15"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: reduce ? 0 : 0.08, duration: 0.18, ease: "easeOut" }}
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
                  {customer.segments.map((segment) => <span key={segment} className="rounded-full bg-black px-2.5 py-1 text-[10px] font-medium text-white">{segmentLabels[segment] || segment}</span>)}
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
      const matchesQuery = !q || [customer.name, customer.phone, customer.primarySource, ...customer.segments].join(" ").toLowerCase().includes(q);
      return matchesSource && matchesQuery;
    });
  }, [customers, query, source]);

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
    <div className="space-y-6 p-1 lg:p-2">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative rounded-2xl bg-[#F3F3F3] p-3 sm:p-4"
      >
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[8px] font-medium tracking-[0.3em] text-black/40 uppercase">Customer Intelligence</p>
            <h1 className="mt-1 text-[22px] font-bold tracking-tight text-black">Customers</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-black/45">Source-aware customer profiles from Shopify, website webhook, manual, and social inbox orders.</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total" value={summary?.totalCustomers ?? 0} sub="Detected customers" />
          <Stat label="Repeat" value={summary?.repeatBuyers ?? 0} sub="Bought more than once" />
          <Stat label="Custom Site" value={summary?.customWebsiteCustomers ?? 0} sub="Webhook customers" />
          <Stat label="Risk" value={summary?.highRiskCustomers ?? 0} sub="Need confirmation" />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="overflow-hidden rounded-xl border border-black/10 bg-white"
      >
        <div className="flex flex-col gap-3 border-b border-black/10 px-6 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Customer Queue</span>
            <div className="h-3.5 w-px bg-black/10" />
            <span className="text-[13px] tabular-nums text-muted-foreground">{loading ? "—" : `${filtered.length} customers`}</span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <MagnifyingGlass weight="light" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers…" className="h-9 w-full rounded-xl border-0 bg-black/[0.06] pl-8 pr-3 text-sm outline-none placeholder:text-black/35 focus:ring-1 focus:ring-black/20 sm:w-56" />
            </div>
          </div>
        </div>

        <Tabs value={source} onValueChange={(value) => setSource(value as Source | "all")} variant="pill" className="px-6 py-4">
          <TabsList className="max-w-full overflow-x-auto bg-black/[0.06] p-1">
            {sourceOptions.map((item) => (
              <TabsTrigger key={item} value={item} className="text-[11px]" indicatorClassName="bg-black">
                {item === "all" ? "All Sources" : sourceLabels[item]}
              </TabsTrigger>
            ))}
          </TabsList>

          {sourceOptions.map((item) => (
            <TabsContent key={item} value={item} className="mt-4">
              <CustomersTable customers={filtered} loading={loading} onSelect={(customer) => { setSelected(customer); setInsight(null); }} />
            </TabsContent>
          ))}
        </Tabs>
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
