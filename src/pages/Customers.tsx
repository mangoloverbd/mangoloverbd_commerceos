import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Brain, MagnifyingGlass, Sparkle, UsersThree } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import { toast } from "@/components/ui/sonner";

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

function money(value: number) {
  return `৳${Math.round(value || 0).toLocaleString("en-BD")}`;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-BD", { month: "short", day: "numeric", year: "numeric" });
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="border border-black/[0.08] bg-white px-5 py-4">
      <p className="text-[8px] font-medium tracking-[0.3em] text-black/45 uppercase">{label}</p>
      <p className="mt-2 text-2xl font-light tabular-nums text-black">{value}</p>
      <p className="mt-1 text-[11px] text-black/40">{sub}</p>
    </div>
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
        if (!res.ok) throw new Error("Failed to load customers");
        const data = await res.json();
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
    <div className="min-h-screen bg-[#FAFAF8] px-4 py-5 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 border-b border-black/[0.06] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[8px] font-medium tracking-[0.3em] text-black/45 uppercase">Customer Intelligence</p>
            <h1 className="mt-2 text-4xl font-light tracking-[-0.04em] text-black">Customers</h1>
            <p className="mt-2 max-w-2xl text-sm text-black/50">Automatically detects Shopify, custom website webhook, manual, and social inbox customers from your existing order data.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-medium text-white">
            <Brain weight="light" size={16} /> AI source-aware profiles
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total" value={summary?.totalCustomers ?? 0} sub="Detected customers" />
          <Stat label="Repeat" value={summary?.repeatBuyers ?? 0} sub="Bought more than once" />
          <Stat label="Custom Site" value={summary?.customWebsiteCustomers ?? 0} sub="Webhook customers" />
          <Stat label="Risk" value={summary?.highRiskCustomers ?? 0} sub="Need confirmation" />
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex h-10 items-center gap-2 border border-black/[0.08] bg-white px-3 sm:w-80">
            <MagnifyingGlass weight="light" size={16} className="text-black/35" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, segment" className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-black/30" />
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "shopify", "custom_website", "facebook", "instagram", "whatsapp", "manual"] as const).map((item) => (
              <button key={item} onClick={() => setSource(item)} className={cn("h-9 border px-3 text-[11px] transition-colors", source === item ? "border-black bg-black text-white" : "border-black/[0.08] bg-white text-black/55 hover:text-black")}>{item === "all" ? "All Sources" : sourceLabels[item]}</button>
            ))}
          </div>
        </div>

        <div className="mt-5 overflow-hidden border border-black/[0.08] bg-white">
          <div className="grid grid-cols-[1.5fr_0.9fr_0.8fr_0.8fr_0.8fr] border-b border-black/[0.06] px-4 py-3 text-[8px] font-medium uppercase tracking-[0.25em] text-black/40 max-lg:hidden">
            <span>Customer</span><span>Source</span><span>Orders</span><span>Spent</span><span>Risk</span>
          </div>
          {loading ? (
            <div className="flex h-56 items-center justify-center"><Spinner className="text-black/40" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center text-center text-black/45"><UsersThree weight="light" size={34} /><p className="mt-3 text-sm">No customers match this filter.</p></div>
          ) : filtered.map((customer) => (
            <button key={customer.id} onClick={() => { setSelected(customer); setInsight(null); }} className="grid w-full grid-cols-1 gap-3 border-b border-black/[0.05] px-4 py-4 text-left transition-colors hover:bg-black/[0.02] lg:grid-cols-[1.5fr_0.9fr_0.8fr_0.8fr_0.8fr] lg:items-center">
              <div>
                <p className="text-sm font-medium text-black">{customer.name}</p>
                <p className="mt-1 text-xs text-black/40">{customer.phone || "No phone"} · Last order {dateLabel(customer.lastOrderAt)}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">{customer.sources.map((item) => <span key={item} className="border border-black/[0.08] px-2 py-1 text-[10px] text-black/55">{sourceLabels[item]}</span>)}</div>
              <p className="text-sm tabular-nums text-black/65">{customer.totalOrders}</p>
              <p className="text-sm tabular-nums text-black/65">{money(customer.totalSpent)}</p>
              <p className={cn("text-xs font-medium capitalize", customer.riskLevel === "high" ? "text-red-600" : customer.riskLevel === "medium" ? "text-amber-600" : "text-emerald-700")}>{customer.riskLevel}</p>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <motion.aside initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }} transition={{ type: "spring", stiffness: 260, damping: 30 }} className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l border-black/[0.08] bg-[#FAFAF8] p-6 shadow-2xl shadow-black/10">
            <button onClick={() => setSelected(null)} className="text-[10px] font-medium uppercase tracking-[0.25em] text-black/40 hover:text-black">Close</button>
            <h2 className="mt-5 text-3xl font-light tracking-[-0.04em]">{selected.name}</h2>
            <p className="mt-1 text-sm text-black/45">{selected.phone || "No phone"} · {sourceLabels[selected.primarySource]}</p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <Stat label="Orders" value={selected.totalOrders} sub="Total" />
              <Stat label="Spent" value={money(selected.totalSpent)} sub="LTV" />
              <Stat label="AOV" value={money(selected.averageOrderValue)} sub="Average" />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">{selected.segments.map((segment) => <span key={segment} className="bg-black px-2.5 py-1 text-[10px] font-medium text-white">{segmentLabels[segment] || segment}</span>)}</div>
            <button onClick={() => generateInsight(selected)} className="mt-6 flex h-10 w-full items-center justify-center gap-2 bg-black text-xs font-medium text-white transition-opacity hover:opacity-85"><Sparkle weight="light" size={16} /> Generate AI Insight</button>
            {(insightLoading || insight) && (
              <div className="mt-4 border border-black/[0.08] bg-white p-4">
                {insightLoading ? <div className="flex items-center gap-2 text-sm text-black/45"><Spinner className="text-black/40" /> Thinking through customer behavior</div> : <div className="space-y-3 text-sm text-black/65"><p>{insight?.summary}</p><p>{insight?.riskExplanation}</p><p className="font-medium text-black">Next: {insight?.nextAction}</p></div>}
              </div>
            )}
            <div className="mt-6">
              <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">Timeline</p>
              <div className="mt-3 space-y-2">
                {selected.timeline.map((entry, index) => <div key={`${entry.id}-${index}`} className="border border-black/[0.06] bg-white p-3"><p className="text-xs font-medium text-black">{entry.orderNumber || entry.kind} · {sourceLabels[entry.source]}</p><p className="mt-1 text-xs text-black/45">{entry.product || "No product"} · {money(entry.amount || 0)} · {entry.status}</p><p className="mt-1 text-[10px] text-black/35">{dateLabel(entry.createdAt)}</p></div>)}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
