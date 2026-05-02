import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { format } from "date-fns";
import { CalendarIcon, Sparkles, Loader2, Package, ArrowRight, TrendingUp, BarChart3, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { PlasticButton } from "@/components/ui/plastic-button";
import ReactMarkdown from "react-markdown";
import type { DateRange } from "react-day-picker";
import { motion, AnimatePresence } from "framer-motion";

interface ItemSummary {
  item: string;
  quantity: number;
  revenue: number;
  orderCount: number;
}

export default function OrderAnalysis() {
  const [mode, setMode] = useState<"single" | "range" | "order">("single");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [singleDate, setSingleDate] = useState<Date | undefined>(new Date());
  const [startOrder, setStartOrder] = useState("");
  const [endOrder, setEndOrder] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [summary, setSummary] = useState<ItemSummary[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);

  const handleAnalyze = async () => {
    let body: any = {};

    if (mode === "single") {
      if (!singleDate) {
        toast.error("Please select a date first");
        return;
      }
      // Send date in Bangladesh timezone context
      body = {
        startDate: format(singleDate, "yyyy-MM-dd"),
        endDate: format(singleDate, "yyyy-MM-dd"),
        timezone: "Asia/Dhaka"
      };
    } else if (mode === "range") {
      if (!dateRange?.from) {
        toast.error("Please select a date range first");
        return;
      }
      body = {
        startDate: format(dateRange.from, "yyyy-MM-dd"),
        endDate: dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : format(dateRange.from, "yyyy-MM-dd"),
        timezone: "Asia/Dhaka"
      };
    } else {
      if (!startOrder || !endOrder) {
        toast.error("Please enter both start and end order numbers");
        return;
      }
      body = { startOrder, endOrder };
    }

    setLoading(true);
    setAnalysis(null);
    setSummary([]);

    try {
      const res = await apiFetch("/api/analyze-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");

      setAnalysis(data.analysis);
      setSummary(data.summary || []);
      setTotalOrders(data.totalOrders || 0);
    } catch (error: any) {
      console.error("Analysis error:", error);
      const message = error?.message || "Failed to analyze orders";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const getLabel = () => {
    if (mode === "single") {
      return singleDate ? format(singleDate, "PPP") : "Select date";
    }
    if (mode === "range") {
      if (!dateRange?.from) return "Select date range";
      if (!dateRange.to) return format(dateRange.from, "PPP");
      return `${format(dateRange.from, "MMM d")} — ${format(dateRange.to, "MMM d")}`;
    }
    return "";
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-[#1A1A1A]">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-black/5 bg-white/80 backdrop-blur-xl px-10 h-16">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-black flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-black">Intelligence Hub</span>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-10 py-16 space-y-16">
        {/* Hero Section */}
        <section className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider">
            <TrendingUp className="w-3 h-3" />
            Live Insights
          </div>
          <h1 className="text-5xl lg:text-6xl font-normal leading-tight">
            Order <span className="italic text-black underline decoration-black/10 transition-colors hover:text-black">Intelligence</span> Analysis
          </h1>
          <p className="text-lg text-black max-w-2xl font-light">
            Deep dive into your sales performance with AI-driven summaries and precise itemized breakdowns.
          </p>
        </section>

        {/* Action Grid */}
        <section className="grid lg:grid-cols-12 gap-10 items-start">
          {/* Mode Selection */}
          <div className="lg:col-span-4 space-y-8">
            <div className="space-y-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-black">Analysis Window</span>
              <div className="flex flex-col gap-2">
                {[
                  { id: "single", label: "Single Day", icon: ClipboardList },
                  { id: "range", label: "Date Range", icon: BarChart3 },
                  { id: "order", label: "Order Range", icon: Package },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id as any)}
                    className={cn(
                      "flex items-center justify-between px-5 py-4 rounded-xl border transition-all duration-300 text-left",
                      mode === m.id
                        ? "bg-black text-white border-black shadow-xl translate-x-2"
                        : "bg-white text-black border-black/5 hover:border-black/20 hover:bg-black/[0.02]"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <m.icon className={cn("w-4 h-4", mode === m.id ? "text-white" : "text-black")} />
                      <span className="font-medium tracking-tight">{m.label}</span>
                    </div>
                    {mode === m.id && <ArrowRight className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Configuration */}
          <div className="lg:col-span-8 flex flex-col justify-between min-h-[300px] p-10 rounded-[2rem] bg-white border border-black/5 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.05)]">
            <div className="space-y-8">
              <div className="space-y-4">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-black">Configuration</span>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={mode}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    {mode === "order" ? (
                      <div className="flex gap-4">
                        <div className="space-y-2 flex-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-black">From Order</label>
                          <Input
                            placeholder="#1001"
                            value={startOrder}
                            onChange={(e) => setStartOrder(e.target.value)}
                            className="h-14 bg-[#F8F8F8] border-none rounded-xl px-6 text-lg focus-visible:ring-1 focus-visible:ring-black"
                          />
                        </div>
                        <div className="space-y-2 flex-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-black">To Order</label>
                          <Input
                            placeholder="#1020"
                            value={endOrder}
                            onChange={(e) => setEndOrder(e.target.value)}
                            className="h-14 bg-[#F8F8F8] border-none rounded-xl px-6 text-lg focus-visible:ring-1 focus-visible:ring-black"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-black">Select Period</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="w-full flex items-center justify-between h-14 bg-[#F8F8F8] hover:bg-[#F2F2F2] transition-colors rounded-xl px-6 text-lg tracking-tight group">
                              <div className="flex items-center gap-3">
                                <CalendarIcon className="w-5 h-5 text-black group-hover:text-black transition-colors" />
                                <span>{getLabel()}</span>
                              </div>
                              <ArrowRight className="w-5 h-5 text-black group-hover:translate-x-1 group-hover:text-black transition-all" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 border-none shadow-2xl rounded-2xl overflow-hidden" align="start">
                            {mode === "single" ? (
                              <Calendar
                                mode="single"
                                selected={singleDate}
                                onSelect={setSingleDate}
                                disabled={(d) => d > new Date()}
                                initialFocus
                                className="p-4"
                              />
                            ) : (
                              <Calendar
                                mode="range"
                                selected={dateRange}
                                onSelect={setDateRange}
                                numberOfMonths={2}
                                disabled={(d) => d > new Date()}
                                initialFocus
                                className="p-4"
                              />
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <div className="pt-10 flex justify-end">
              <PlasticButton
                text="Generate Deep Analysis"
                onClick={handleAnalyze}
                loading={loading}
                disabled={(mode === "single" ? !singleDate : mode === "range" ? !dateRange?.from : (!startOrder || !endOrder))}
                className="w-full sm:w-auto h-14 !text-base"
              />
            </div>
          </div>
        </section>

        {/* Results Area */}
        <AnimatePresence>
          {analysis && (
            <motion.section
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-16"
            >
              {/* Stats Bar */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1 border-y border-black/5 py-10">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-black">Total Orders</span>
                  <p className="text-4xl font-light tracking-tighter">{totalOrders}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-black">Unique Items</span>
                  <p className="text-4xl font-light tracking-tighter">{summary.length}</p>
                </div>
                <div className="space-y-1 col-span-2 text-right">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-black">Total Revenue Identified</span>
                  <p className="text-4xl font-light tracking-tighter">৳{summary.reduce((acc, curr) => acc + curr.revenue, 0).toLocaleString()}</p>
                </div>
              </div>

              {/* Data Display */}
              <div className="grid lg:grid-cols-2 gap-16">
                {/* Table - Only show if we have items */}
                <div className="space-y-8">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-black"></div>
                    <h3 className="text-sm font-bold uppercase tracking-widest">Inventory Breakdown</h3>
                  </div>
                  {summary.length > 0 ? (
                    <div className="divide-y divide-black/[0.03]">
                      {summary.map((s, i) => (
                        <div key={i} className="flex items-center justify-between py-5 group">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full border border-black/5 flex items-center justify-center bg-white group-hover:bg-black group-hover:text-white transition-all duration-300">
                              <Package className="w-4 h-4 opacity-70" />
                            </div>
                            <div>
                              <p className="font-medium tracking-tight transition-all group-hover:translate-x-1">{s.item}</p>
                              <p className="text-[10px] text-black uppercase font-bold">{s.orderCount} Orders</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-light tracking-tight">x{s.quantity}</p>
                            <p className="text-xs text-black">৳{s.revenue.toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-10 text-center border rounded-2xl border-dashed border-black/10">
                      <p className="text-sm text-black">No items to display for this period.</p>
                    </div>
                  )}
                </div>

                {/* AI Text */}
                <div className="space-y-8">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-bold uppercase tracking-widest">AI Synthesis</h3>
                  </div>
                  <div className="prose prose-sm max-w-none text-black leading-relaxed font-light bg-black/[0.01] p-10 rounded-[2.5rem] border border-black/5">
                    <ReactMarkdown>{analysis}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <div className="relative">
              <div className="h-20 w-20 rounded-full border border-black/5 bg-white flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-black" />
              </div>
              <div className="absolute inset-0 h-20 w-20 rounded-full border-t-2 border-black animate-[spin_1.5s_linear_infinite]" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-sm font-bold uppercase tracking-[0.3em] text-black">Processing Data</p>
              <p className="text-xs text-black font-light">Analyzing trends and summarizing metrics...</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
