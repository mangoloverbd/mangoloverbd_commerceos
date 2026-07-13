import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { RichButton } from "@/components/ui/rich-button";
import * as PricingCard from "@/components/ui/pricing-card";
import { Spinner } from "@/components/ui/ios-spinner";
import { toast } from "@/components/ui/sonner";
import { CheckCircle, Storefront, TrendUp, XCircle } from "@phosphor-icons/react";
import { CreditCard, Receipt, TrendingUp, Crown } from "lucide-react";

type Section = "plan" | "usage" | "payment" | "invoices";

const NAV: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "plan", label: "Plan", icon: Crown },
  { id: "usage", label: "Usage", icon: TrendingUp },
  { id: "payment", label: "Payment", icon: CreditCard },
  { id: "invoices", label: "Invoices", icon: Receipt },
];

interface PlanInfo {
  id: string;
  name: string;
  price: number;
  interval: "monthly" | "yearly";
  status: "active" | "trialing" | "trial_expired" | "past_due" | "canceled";
  renewsAt: string;
  startedAt: string;
  trialEndsAt?: string | null;
}

interface UsageData {
  aiInboxReplies: { used: number; limit: number };
  aiOrderCaptures: { used: number; limit: number };
  aiExtractions: { used: number; limit: number };
  fraudChecks: { used: number; limit: number };
  period: string;
}

interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: "paid" | "pending" | "failed";
}

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    subtitle: "Solo sellers, 1-3 orders/day",
    price: 1499,
    features: [
      { category: "Team", value: "1 member" },
      { category: "Orders", value: "500/mo" },
      { category: "Courier", value: "1 courier (Steadfast or Pathao)" },
      { category: "Fraud Checks", value: "50/mo" },
      { category: "Social Inbox", value: "1 platform" },
      { category: "AI Inbox Replies", value: "300/mo" },
      { category: "AI Order Capture", value: "50/mo" },
      { category: "AI Extractions", value: "100/mo" },
      { category: "AI Analysis", value: "5 runs/mo" },
      { category: "Products", value: "50" },
      { category: "Brand Doc", value: "500 words" },
      { category: "Auto-reply", value: "Manual trigger" },
      { category: "Dashboard", value: "Basic (weekly)" },
      { category: "Support", value: "Email (48hr)" },
    ],
  },
  {
    id: "growth",
    name: "Growth",
    subtitle: "Growing sellers, 5-15 orders/day",
    price: 3499,
    features: [
      { category: "Team", value: "3 members" },
      { category: "Orders", value: "2,000/mo" },
      { category: "Courier", value: "All (Steadfast + Pathao)" },
      { category: "Fraud Checks", value: "300/mo" },
      { category: "Social Inbox", value: "2 platforms" },
      { category: "AI Inbox Replies", value: "1,500/mo" },
      { category: "AI Order Capture", value: "300/mo" },
      { category: "AI Extractions", value: "500/mo" },
      { category: "AI Analysis", value: "20 runs/mo" },
      { category: "Products", value: "200" },
      { category: "Brand Doc", value: "2,000 words" },
      { category: "Auto-reply", value: "Business hours" },
      { category: "Dashboard", value: "Full (daily + weekly)" },
      { category: "Support", value: "Email (24hr) + WhatsApp" },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    subtitle: "Established brands, 30-60 orders/day",
    price: 7999,
    popular: true,
    features: [
      { category: "Team", value: "10 members" },
      { category: "Orders", value: "10,000/mo" },
      { category: "Courier", value: "All + bulk dispatch" },
      { category: "Fraud Checks", value: "1,500/mo" },
      { category: "Social Inbox", value: "All 3 platforms" },
      { category: "AI Inbox Replies", value: "7,000/mo" },
      { category: "AI Order Capture", value: "1,500/mo" },
      { category: "AI Extractions", value: "2,000/mo" },
      { category: "AI Analysis", value: "100 runs/mo" },
      { category: "Products", value: "1,000" },
      { category: "Brand Doc", value: "Full + catalog context" },
      { category: "Auto-reply", value: "24/7 auto-reply" },
      { category: "Premium AI", value: "200 GPT-4o replies/mo" },
      { category: "Dashboard", value: "Full + export (CSV/PDF)" },
      { category: "Support", value: "Priority WhatsApp (4hr)" },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    subtitle: "Large operations, 100+ orders/day",
    price: 14999,
    features: [
      { category: "Team", value: "Unlimited" },
      { category: "Orders", value: "Unlimited" },
      { category: "Courier", value: "All + custom courier API" },
      { category: "Fraud Checks", value: "Unlimited" },
      { category: "Social Inbox", value: "All + multi-page" },
      { category: "AI Inbox Replies", value: "30,000/mo" },
      { category: "AI Order Capture", value: "Unlimited" },
      { category: "AI Extractions", value: "10,000/mo" },
      { category: "AI Analysis", value: "Unlimited" },
      { category: "Products", value: "Unlimited" },
      { category: "Brand Doc", value: "Full + custom training" },
      { category: "Auto-reply", value: "24/7 + escalation rules" },
      { category: "Premium AI", value: "1,000 GPT-4o replies/mo" },
      { category: "Dashboard", value: "Full + API access" },
      { category: "Support", value: "Dedicated manager + phone" },
    ],
  },
];

const VISIBLE_PLAN_IDS = new Set(["starter", "growth"]);

const PLAN_CARD_FEATURES: Record<string, { included: string[]; locked?: string[] }> = {
  starter: {
    included: [
      "500 orders and 50 fraud checks each month",
      "One team member and one courier connection",
      "300 AI inbox replies and 100 extractions",
      "One social platform and basic weekly analytics",
    ],
    locked: [
      "Both courier integrations and three team members",
      "Daily analytics and priority WhatsApp support",
    ],
  },
  growth: {
    included: [
      "2,000 orders and 300 fraud checks each month",
      "Three team members with Steadfast and Pathao",
      "1,500 AI inbox replies and 500 AI extractions",
      "300 AI order captures and 20 analysis runs",
      "Two social inbox platforms with business-hours automation",
      "200 products and a 2,000-word brand document",
      "Full daily analytics and priority WhatsApp support",
    ],
  },
};

function UsageBar({ label, used, limit, icon }: { label: string; used: number; limit: number; icon?: React.ReactNode }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const tone = pct >= 90 ? "red" : pct >= 70 ? "amber" : "emerald";

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[13px] font-medium text-black">{label}</span>
        </div>
        <span className="text-[12px] text-black/50 tabular-nums">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-black/[0.06] overflow-hidden">
        <motion.div
          className={cn(
            "h-full rounded-full",
            tone === "emerald" && "bg-emerald-500",
            tone === "amber" && "bg-amber-500",
            tone === "red" && "bg-red-500"
          )}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      {pct >= 90 && (
        <p className="text-[11px] text-red-600 mt-1.5">
          {pct >= 100 ? "Limit reached — upgrade or purchase a top-up." : "Approaching limit."}
        </p>
      )}
    </div>
  );
}

function PlanSection({ currentPlan, onRefresh }: { currentPlan: PlanInfo | null; onRefresh: () => void }) {
  const [switching, setSwitching] = useState<string | null>(null);

  const handleSwitch = async (planId: string) => {
    if (planId === currentPlan?.id) return;
    setSwitching(planId);
    try {
      const res = await apiFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start checkout");
      }
      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to start checkout");
    } finally {
      setSwitching(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div>
          <h2 className="text-[17px] font-semibold text-black tracking-tight">Current Plan</h2>
          <p className="mt-0.5 text-[13px] text-black/45">
            {currentPlan ? (
              currentPlan.status === "trialing" && currentPlan.trialEndsAt ? (
                (() => {
                  const daysLeft = Math.max(0, Math.ceil((new Date(currentPlan.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                  return <>
                    You're on a <span className="font-medium text-black">7-day free trial</span> of the <span className="font-medium text-black">{currentPlan.name}</span> plan.
                    {daysLeft > 0 ? <> <span className="font-medium text-emerald-600">{daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining.</span></> : <span className="font-medium text-red-600"> Trial expired.</span>}
                  </>;
                })()
              ) : currentPlan.status === "trial_expired" ? (
                <>
                  Your free trial has <span className="font-medium text-red-600">expired</span>. Choose a plan below to continue using Merchant-Suite.
                </>
              ) : (
                <>
                  You're on the <span className="font-medium text-black">{currentPlan.name}</span> plan.
                  {currentPlan.renewsAt && ` Renews ${new Date(currentPlan.renewsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`}
                </>
              )
            ) : (
              "No active plan. Choose one below to get started."
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2">
          {PLANS.filter((plan) => VISIBLE_PLAN_IDS.has(plan.id)).map((plan) => {
            const isCurrent = currentPlan?.id === plan.id;
            const display = PLAN_CARD_FEATURES[plan.id];
            const PlanIcon = plan.id === "growth" ? TrendUp : Storefront;

            return (
              <PricingCard.Card
                key={plan.id}
                data-testid={`plan-${plan.id}`}
                className={cn(
                  "w-full border-transparent transition-all duration-300 hover:-translate-y-0.5",
                  "shadow-[0_2px_4px_0_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.16),inset_0_1px_0_0_#FDFDFD]",
                  plan.id === "growth" && "bg-blue-50/40",
                )}
              >
                <PricingCard.Header className={cn(plan.id === "growth" && "bg-blue-50/70")}>
                  <PricingCard.Plan>
                    <PricingCard.PlanName>
                      <PlanIcon weight="light" />
                      <span>{plan.name}</span>
                    </PricingCard.PlanName>
                    <PricingCard.Badge
                      className={cn(plan.id === "growth" && "border-blue-500/20 text-blue-600")}
                    >
                      {plan.id === "growth" ? "Recommended" : "Solo sellers"}
                    </PricingCard.Badge>
                  </PricingCard.Plan>

                  <PricingCard.Price>
                    <PricingCard.MainPrice>৳{plan.price.toLocaleString()}</PricingCard.MainPrice>
                    <PricingCard.Period>/ month</PricingCard.Period>
                  </PricingCard.Price>

                  <RichButton
                    color="default"
                    size="default"
                    onClick={() => handleSwitch(plan.id)}
                    disabled={isCurrent || switching !== null}
                    className="relative z-10 w-full"
                  >
                    {switching === plan.id ? (
                      <Spinner size="sm" className="mx-auto" />
                    ) : isCurrent ? (
                      "Current Plan"
                    ) : (
                      currentPlan && PLANS.findIndex(p => p.id === plan.id) < PLANS.findIndex(p => p.id === currentPlan.id)
                        ? "Downgrade"
                        : "Upgrade"
                    )}
                  </RichButton>
                </PricingCard.Header>

                <PricingCard.Body>
                  <p className="mb-3 text-[11px] font-medium text-black">
                    {plan.id === "growth" ? "More capacity and automation" : "Everything you need to start"}
                  </p>
                  <PricingCard.List>
                    {display.included.map((feature) => (
                      <PricingCard.ListItem key={feature} data-testid="included-feature">
                        <CheckCircle weight="light" className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                        <span>{feature}</span>
                      </PricingCard.ListItem>
                    ))}
                  </PricingCard.List>

                  {display.locked && (
                    <>
                      <PricingCard.Separator />
                      <PricingCard.List>
                        {display.locked.map((feature) => (
                          <PricingCard.ListItem key={feature} className="opacity-70">
                            <XCircle weight="light" className="mt-0.5 size-4 shrink-0 text-black/35" />
                            <span>{feature}</span>
                          </PricingCard.ListItem>
                        ))}
                      </PricingCard.List>
                    </>
                  )}
                </PricingCard.Body>
              </PricingCard.Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function UsageSection({ usage }: { usage: UsageData | null }) {
  if (!usage) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-5 w-5 text-black/30" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[17px] font-semibold text-black tracking-tight">Usage This Month</h2>
        <p className="mt-0.5 text-[13px] text-black/45">
          Billing period: {usage.period}
        </p>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white divide-y divide-black/[0.06]">
        <UsageBar
          label="AI Inbox Replies"
          used={usage.aiInboxReplies.used}
          limit={usage.aiInboxReplies.limit}
          icon={<img src="https://img.icons8.com/material-rounded/24/bard--v2.png" alt="" className="h-4 w-4 object-contain opacity-60" />}
        />
        <UsageBar
          label="AI Order Captures"
          used={usage.aiOrderCaptures.used}
          limit={usage.aiOrderCaptures.limit}
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-black/40"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>}
        />
        <UsageBar
          label="AI Extractions"
          used={usage.aiExtractions.used}
          limit={usage.aiExtractions.limit}
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-black/40"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
        />
        <UsageBar
          label="Fraud Checks"
          used={usage.fraudChecks.used}
          limit={usage.fraudChecks.limit}
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-black/40"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
        />
      </div>

      <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white p-5">
        <p className="text-[13px] font-medium text-black mb-2">Need more?</p>
        <p className="text-[11px] text-black/50 mb-3">Purchase a top-up pack without changing your plan.</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "+100 AI Replies", price: 199 },
            { label: "+500 AI Replies", price: 499 },
            { label: "+100 Extractions", price: 149 },
            { label: "+50 Fraud Checks", price: 99 },
          ].map((pack) => (
            <RichButton
              key={pack.label}
              color="default"
              size="default"
              className="px-3"
            >
              {pack.label} · ৳{pack.price}
            </RichButton>
          ))}
        </div>
      </div>
    </div>
  );
}

function PaymentSection() {
  const [loading, setLoading] = useState(false);

  const openPortal = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to open portal");
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to open portal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[17px] font-semibold text-black tracking-tight">Payment Method</h2>
        <p className="mt-0.5 text-[13px] text-black/45">Manage how you pay for your subscription.</p>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white divide-y divide-black/[0.06]">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-14 rounded-md bg-gradient-to-br from-black/[0.08] to-black/[0.03] flex items-center justify-center">
              <CreditCard className="h-4 w-4 text-black/40" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[13px] font-medium text-black">Manage via Stripe</p>
              <p className="text-[11px] text-black/40 mt-0.5">Update your card, view invoices, or cancel your subscription.</p>
            </div>
          </div>
          <RichButton
            color="default"
            size="default"
            onClick={openPortal}
            disabled={loading}
          >
            {loading ? <Spinner size="sm" className="mx-auto" /> : "Manage Billing"}
          </RichButton>
        </div>

        <div className="px-5 py-4">
          <p className="text-[11px] text-black/40">
            Powered by Stripe. Supports Visa, Mastercard, and other international payment methods.
          </p>
        </div>
      </div>
    </div>
  );
}

function InvoiceSection({ invoices }: { invoices: Invoice[] }) {
  if (invoices.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-[17px] font-semibold text-black tracking-tight">Invoices</h2>
          <p className="mt-0.5 text-[13px] text-black/45">Your billing history.</p>
        </div>
        <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white p-10 text-center">
          <Receipt className="h-6 w-6 text-black/20 mx-auto mb-2" strokeWidth={1.5} />
          <p className="text-[13px] text-black/40">No invoices yet.</p>
          <p className="text-[11px] text-black/25 mt-0.5">Invoices will appear here after your first payment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[17px] font-semibold text-black tracking-tight">Invoices</h2>
        <p className="mt-0.5 text-[13px] text-black/45">Your billing history.</p>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white divide-y divide-black/[0.06]">
        {invoices.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-[13px] font-medium text-black">
                  ৳{inv.amount.toLocaleString()}
                </span>
                <span className="text-[11px] text-black/40">
                  {new Date(inv.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full",
                  inv.status === "paid" && "bg-emerald-50 text-emerald-600",
                  inv.status === "pending" && "bg-amber-50 text-amber-600",
                  inv.status === "failed" && "bg-red-50 text-red-600"
                )}
              >
                {inv.status}
              </span>
              <button className="text-[11px] text-black/40 hover:text-black transition-colors underline underline-offset-2">
                Download
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Billing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [section, setSection] = useState<Section>("plan");
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (searchParams.get("session_id")) {
      toast.success("Subscription activated! Your plan is now active.");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const fetchBilling = async () => {
    try {
      const [planRes, usageRes, invoicesRes] = await Promise.all([
        apiFetch("/api/billing/plan"),
        apiFetch("/api/billing/usage"),
        apiFetch("/api/billing/invoices"),
      ]);

      if (planRes.ok) {
        const data = await planRes.json();
        setPlan(data.plan);
      }
      if (usageRes.ok) {
        const data = await usageRes.json();
        setUsage(data.usage);
      }
      if (invoicesRes.ok) {
        const data = await invoicesRes.json();
        setInvoices(data.invoices);
      }
    } catch (e) {
      console.error("[Billing] fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBilling();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-5 w-5 text-black/30" />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex justify-center items-center gap-1 border-b border-black/[0.07] px-5 pt-4 pb-0">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={cn(
              "relative flex items-center gap-2 px-3 pb-3 text-[13px] font-medium transition-colors",
              section === id ? "text-black" : "text-black/40 hover:text-black/70"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
            {label}
            {section === id && (
              <motion.span
                layoutId="billing-tab-indicator"
                className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-black"
              />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-0 overflow-auto px-6 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {section === "plan" && <PlanSection currentPlan={plan} onRefresh={fetchBilling} />}
            {section === "usage" && <UsageSection usage={usage} />}
            {section === "payment" && <PaymentSection />}
            {section === "invoices" && <InvoiceSection invoices={invoices} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
