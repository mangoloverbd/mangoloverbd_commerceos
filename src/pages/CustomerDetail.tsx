import { useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, CaretLeft, CaretRight, ChatCircle, MapPin, Phone, Plus } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { CopyButton } from "@/components/ui/copy-button";
import { CustomerSmsDialog } from "@/components/CustomerSmsDialog";
import { CustomerContext } from "@/components/customer-profile/CustomerContext";
import { FraudPanel } from "@/components/order-editor/FraudPanel";
import { customerDate, customerMoney, customerOrderHref, type CustomerHistoryOrder, type CustomerProfileResponse, type ProfilePage } from "@/lib/customerProfile";
import { orderSourceLabel } from "@/lib/orderSource";
import { YIELD_COLORS } from "@/lib/staffPerformanceCharts";

const EYEBROW = "text-[8px] font-medium uppercase tracking-[0.3em] text-black";
const CARD = "rounded-2xl bg-white p-5";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25";
const RED = "text-[#B4473A]";
// Router link styled as the base primary button.
const PRIMARY_LINK = `inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] bg-button-primary px-3.5 text-[13px] font-medium text-text-white shadow-xs transition-opacity hover:opacity-90 ${FOCUS}`;
const ORDER_GRID = "@2xl:grid @2xl:grid-cols-[92px_minmax(0,1fr)_96px_120px_96px] @2xl:items-center @2xl:gap-4";

type Tab = "overview" | "orders" | "notes" | "activity";
type Outcome = CustomerHistoryOrder["outcome"];
type NavState = { from: string; profileNavigationState: { customerListState: unknown } };

const OUTCOME_LABELS: Record<Outcome, string> = {
  delivered: "Delivered",
  active: "Active",
  partial_delivered: "Partial",
  returned: "Returned",
  cancelled: "Cancelled",
};
const OUTCOME_COLORS: Record<Outcome, string> = {
  delivered: YIELD_COLORS.delivered,
  active: YIELD_COLORS.inTransit,
  partial_delivered: `color-mix(in srgb, ${YIELD_COLORS.delivered} 45%, white)`,
  returned: YIELD_COLORS.returned,
  cancelled: YIELD_COLORS.cancelled,
};
const OUTCOME_CHIP: Record<Outcome, "green" | "blue" | "lime" | "purple" | "rose"> = {
  delivered: "green",
  active: "blue",
  partial_delivered: "lime",
  returned: "purple",
  cancelled: "rose",
};
const RISK_CHIP = { low: "green", medium: "yellow", high: "rose" } as const;
const LIFECYCLE_LABELS: Record<CustomerProfileResponse["profile"]["lifecycleStage"], string> = {
  new: "New customer",
  repeat: "Repeat buyer",
  vip: "VIP",
  dormant: "Dormant",
  risky: "Risky",
};

const humanize = (value: string) => value.replace(/_/g, " ");
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";

function Card({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${CARD} flex min-w-0 flex-col gap-3.5 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={EYEBROW}>{title}</h2>
        {action && <div className="text-[12px] text-black/55 tabular-nums">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, sub, large }: { label: string; value: ReactNode; sub: ReactNode; large?: boolean }) {
  return (
    <div className={`${CARD} flex h-full min-w-0 flex-col gap-1.5 tabular-nums`}>
      <p className={EYEBROW}>{label}</p>
      <p className={`m-0 min-w-0 break-words font-light text-black [overflow-wrap:anywhere] ${large ? "text-[32px] leading-none tracking-[-0.04em] sm:text-[40px]" : "text-[26px] leading-tight tracking-[-0.02em]"}`}>{value}</p>
      <p className="text-[11px] text-black/55">{sub}</p>
    </div>
  );
}

function TextLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded text-[12px] text-black hover:underline hover:underline-offset-4 ${FOCUS}`}>{children}</button>;
}

function Pager({ data, label, onChange, busy }: { data: ProfilePage<unknown>; label: string; onChange: (page: number) => void; busy: boolean }) {
  if (data.totalPages <= 1) return null;
  return (
    <nav aria-label={`${label} pagination`} className="flex items-center justify-between gap-3 border-t border-black/[0.07] pt-3 text-[12px] text-black/55 tabular-nums">
      <span>Page {data.page} of {data.totalPages} · {data.total} records</span>
      <div className="flex gap-1">
        <Button variant="ghost" size="small" iconOnly leadingIcon={CaretLeft} aria-label={`Previous ${label.toLowerCase()}`} disabled={busy || data.page <= 1} onClick={() => onChange(data.page - 1)} />
        <Button variant="ghost" size="small" iconOnly leadingIcon={CaretRight} aria-label={`Next ${label.toLowerCase()}`} disabled={busy || data.page >= data.totalPages} onClick={() => onChange(data.page + 1)} />
      </div>
    </nav>
  );
}

function OrderTableHead() {
  return (
    <div aria-hidden="true" className={`hidden pb-2 text-[10px] uppercase tracking-[0.14em] text-black/45 ${ORDER_GRID}`}>
      <span>Order</span><span>Products</span><span>Date</span><span>Status</span><span className="text-right">Amount</span>
    </div>
  );
}

function OrderRow({ order, nav }: { order: CustomerHistoryOrder; nav: NavState }) {
  const products = order.products.map((product) => `${product.name}${product.quantity === null ? "" : ` ×${product.quantity}`}`).join(", ");
  const courier = order.courierName || order.trackingCode || order.consignmentId
    ? [order.courierName || "Courier not recorded", order.trackingCode || order.consignmentId || "", order.courierStatus ? humanize(order.courierStatus) : ""].filter(Boolean).join(" · ")
    : "";
  const lost = order.outcome === "cancelled" || order.outcome === "returned";
  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t border-black/[0.07] py-3 text-[13px] ${ORDER_GRID}`}>
      <Link to={customerOrderHref(order)} state={nav} className={`w-fit rounded font-medium text-black hover:underline hover:underline-offset-4 ${FOCUS}`}>
        {order.orderNumber || (order.kind === "social_order" ? "Inbox order" : "Order")}
      </Link>
      <div className="col-span-2 row-start-2 min-w-0 @2xl:col-span-1 @2xl:row-start-auto">
        <p className="break-words text-black">{products || "Product details unavailable"}</p>
        <p className="mt-0.5 break-all text-[11px] capitalize text-black/50">{[orderSourceLabel(order.source), courier].filter(Boolean).join(" · ")}</p>
      </div>
      <span className="col-span-2 row-start-3 text-[11px] text-black/55 tabular-nums @2xl:col-span-1 @2xl:row-start-auto @2xl:text-[13px]">{customerDate(order.createdAt)}</span>
      <div className="col-span-2 row-start-4 flex flex-wrap gap-1 @2xl:col-span-1 @2xl:row-start-auto">
        <Chip variant="caption" color={OUTCOME_CHIP[order.outcome]} className="capitalize">{order.outcome === "active" ? humanize(order.status) : OUTCOME_LABELS[order.outcome]}</Chip>
        {order.pendingReturn && <Chip variant="caption" color="yellow">Return requested</Chip>}
      </div>
      <span className={`col-start-2 row-start-1 text-right tabular-nums @2xl:col-start-auto @2xl:row-start-auto ${lost ? "text-black/45" : "text-black"}`}>{customerMoney(order.amount)}</span>
    </li>
  );
}

export default function CustomerDetail() {
  const { id = "" } = useParams();
  // A changed route identity remounts all drafts and pagination together.
  return <CustomerDetailContent key={id} customerId={id} />;
}
function CustomerDetailContent({ customerId }: { customerId: string }) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [ordersPage, setOrdersPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [notesPage, setNotesPage] = useState(1);
  const [smsOpen, setSmsOpen] = useState(false);
  const queryPrefix = ["customer-profile", customerId];
  const query = useQuery<CustomerProfileResponse>({
    queryKey: [...queryPrefix, ordersPage, activityPage, notesPage],
    enabled: Boolean(customerId), staleTime: 15_000, retry: false, placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const response = await apiFetch(`/api/customers/${encodeURIComponent(customerId)}?ordersPage=${ordersPage}&activityPage=${activityPage}&notesPage=${notesPage}`, { signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load customer profile");
      return data;
    },
  });
  const backState = location.state?.customerListState;
  const back = (
    <Link to="/customers" state={backState ? { customerListState: backState } : undefined} className={`inline-flex h-6 w-fit items-center gap-2 rounded-[10px] pr-2 text-[13px] text-black/55 transition-colors hover:text-black ${FOCUS}`}>
      <ArrowLeft weight="light" size={16} aria-hidden="true" />Customers
    </Link>
  );

  if (query.isPending) return <div className="min-h-full bg-[#FAFAF8] p-4">{back}<p role="status" className="py-24 text-center text-[13px] text-black/55">Loading customer profile…</p></div>;
  if (query.error && !query.data) return (
    <div className="min-h-full bg-[#FAFAF8] p-4">
      {back}
      <div className="py-24 text-center">
        <h1 className="font-sf-display text-[15px] font-semibold text-black">Customer profile unavailable</h1>
        <p role="alert" className="mx-auto mt-1 max-w-md text-[13px] text-black/60">{query.error.message}</p>
        <Button variant="secondary" size="small" className="mt-4" onClick={() => query.refetch()}>Retry</Button>
      </div>
    </div>
  );
  if (!query.data) return null;

  const { profile, context, orders, activeOrders, activity, notes } = query.data;
  const summary = profile.summary;
  const profilePath = `/customers/${encodeURIComponent(customerId)}`;
  const nav: NavState = { from: profilePath, profileNavigationState: { customerListState: backState } };
  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: queryPrefix }); };
  const outcomeCounts: Record<Outcome, number> = {
    delivered: summary.deliveredOrders,
    partial_delivered: summary.partialDeliveredOrders,
    active: summary.activeOrders,
    returned: summary.returnedOrders,
    cancelled: summary.cancelledOrders,
  };
  const outcomeKeys = (Object.keys(outcomeCounts) as Outcome[]).filter((key) => outcomeCounts[key] > 0);
  const outcomeTotal = outcomeKeys.reduce((sum, key) => sum + outcomeCounts[key], 0);
  const deliveredShare = outcomeTotal ? Math.round((summary.deliveredOrders / outcomeTotal) * 100) : null;
  const recentOrders = orders.items.slice(0, 5);
  // Active work first; otherwise the newest order (only known on the first history page).
  const spotlightOrder = activeOrders[0] ?? (ordersPage === 1 ? orders.items[0] : undefined);
  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "orders", label: "Orders", count: orders.total },
    { id: "notes", label: "Notes", count: notes.total },
    { id: "activity", label: "Activity", count: activity.total },
  ];

  const rail = (
    <section aria-label="Customer" className={`${CARD} flex min-w-0 flex-col gap-4 pt-3`}>
      {back}
      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3">
        <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-full bg-black text-[18px] font-medium text-[#FAFAF8]">{initials(profile.name)}</span>
        <div className="min-w-0">
          <h1 className="break-words font-sf-display text-[24px] font-bold tracking-tight text-black [overflow-wrap:anywhere]">{profile.name}</h1>
          <div className="mt-0.5 flex items-center gap-1.5 text-[14px] tabular-nums text-black">
            {profile.phone || <span className="text-black/55">No valid phone recorded</span>}
            {profile.phone && <CopyButton value={profile.phone} aria-label={`Copy phone number ${profile.phone}`} />}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip variant="caption" color="gray">{LIFECYCLE_LABELS[profile.lifecycleStage]}</Chip>
          <Chip variant="caption" color={RISK_CHIP[profile.riskLevel]} className="capitalize">{profile.riskLevel} risk</Chip>
          {context.tags.map((tag) => <Chip key={tag} variant="caption" color="purple">{tag}</Chip>)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {profile.phone && <ButtonLink variant="secondary" size="medium" leadingIcon={Phone} href={`tel:${profile.phone}`}>Call customer</ButtonLink>}
        <Button variant="secondary" size="medium" leadingIcon={ChatCircle} disabled={!profile.phone} onClick={() => setSmsOpen(true)} className={profile.phone ? "" : "col-span-2"}>Send SMS</Button>
        <Link to="/orders/new" state={{ ...nav, customerPrefill: { customerName: profile.name === "Unknown" ? "" : profile.name, phone: profile.phone, address: profile.latestAddress || "" } }} className={`${PRIMARY_LINK} col-span-2`}>
          <Plus weight="light" size={16} aria-hidden="true" />Create order
        </Link>
      </div>

      {context.followUpOn ? (
        <div className="flex flex-col gap-1 rounded-xl bg-[#FFF8E8] px-3.5 py-3">
          <p className={`${EYEBROW} text-[#7A5410]`}>Follow-up · {customerDate(context.followUpOn)}</p>
          {context.followUpReason && <p className="text-[13px] text-black">{context.followUpReason}</p>}
          <div className="flex items-center justify-between gap-2 text-[11px] text-black/50">
            <span>{context.updatedByName ? `Set by ${context.updatedByName}` : ""}</span>
            <TextLink onClick={() => setTab("notes")}>Edit</TextLink>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-[#F7F7F5] px-3.5 py-3">
          <div>
            <p className={EYEBROW}>Follow-up</p>
            <p className="mt-1 text-[12px] text-black/55">No follow-up scheduled</p>
          </div>
          <TextLink onClick={() => setTab("notes")}>Set follow-up</TextLink>
        </div>
      )}

      {spotlightOrder && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-black/[0.07] px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className={EYEBROW}>{spotlightOrder.outcome === "active" ? "Needs handling" : "Latest order"}</p>
            <Chip variant="caption" color={OUTCOME_CHIP[spotlightOrder.outcome]} className="capitalize">{spotlightOrder.outcome === "active" ? humanize(spotlightOrder.status) : OUTCOME_LABELS[spotlightOrder.outcome]}</Chip>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <Link to={customerOrderHref(spotlightOrder)} state={nav} className={`rounded text-[14px] font-medium text-black hover:underline hover:underline-offset-4 ${FOCUS}`}>{spotlightOrder.orderNumber || "Open order"}</Link>
            <span className="text-[14px] tabular-nums text-black">{customerMoney(spotlightOrder.amount)}</span>
          </div>
          <p className="line-clamp-2 break-words text-[12px] text-black/65">{spotlightOrder.products.map((product) => `${product.name}${product.quantity === null ? "" : ` ×${product.quantity}`}`).join(", ") || "Product details unavailable"}</p>
          <p className="text-[11px] text-black/45">{customerDate(spotlightOrder.createdAt)} · {orderSourceLabel(spotlightOrder.source)}</p>
        </div>
      )}
      </div>

      <dl className="flex min-w-0 flex-col gap-3.5 border-t border-black/[0.07] pt-4 md:border-t-0 md:pt-0">
        <div className="min-w-0">
          <dt className="text-[11px] text-black/50">Delivery address</dt>
          <dd className="mt-1 flex items-start gap-1.5 break-words text-[13px] leading-relaxed text-black">
            <MapPin weight="light" size={15} className="mt-0.5 shrink-0 text-black/45" aria-hidden="true" />
            {profile.latestAddress || "No delivery address recorded"}
          </dd>
          {profile.addresses.length > 1 && (
            <details className="mt-1.5 text-[13px]">
              <summary className={`cursor-pointer rounded text-[11px] text-black/50 hover:text-black ${FOCUS}`}>{plural(profile.addresses.length - 1, "previous address")}</summary>
              <ul className="mt-2 space-y-2">
                {profile.addresses.slice(1).map((entry) => (
                  <li key={entry.address}>
                    <p className="break-words text-black">{entry.address}</p>
                    <p className="mt-0.5 text-[11px] text-black/50">Last used {customerDate(entry.lastUsedAt)} · {plural(entry.orders, "order")}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><dt className="text-[11px] text-black/50">Customer since</dt><dd className="mt-1 text-[13px] text-black">{customerDate(profile.firstOrderAt)}</dd></div>
          <div><dt className="text-[11px] text-black/50">Last order</dt><dd className="mt-1 text-[13px] text-black">{customerDate(profile.lastOrderAt)}</dd></div>
        </div>
        <div>
          <dt className="text-[11px] text-black/50">Channels</dt>
          <dd className="mt-1.5 flex flex-wrap gap-1.5">{profile.sources.map((source) => <Chip key={source} variant="caption" color="soft">{orderSourceLabel(source)}</Chip>)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-black/50">Segments <span className="text-black/35">· rule-based</span></dt>
          <dd className="mt-1.5 flex flex-wrap gap-1.5">
            {profile.campaignSegments.length ? profile.campaignSegments.map((segment) => <Chip key={segment} variant="caption" color="soft" className="capitalize">{humanize(segment)}</Chip>) : <span className="text-[13px] text-black/55">None</span>}
          </dd>
        </div>
        {profile.suggestion && (
          <div>
            <dt className="text-[11px] text-black/50">Next step</dt>
            <dd className="mt-1.5 rounded-[10px] bg-[#F7F7F5] px-3 py-2.5 text-[12px] leading-relaxed text-black">{profile.suggestion}</dd>
          </div>
        )}
        <div>
          <dt className="flex items-baseline justify-between gap-2 text-[11px] text-black/50">
            Latest note
            <TextLink onClick={() => setTab("notes")}>{notes.total ? `All notes (${notes.total})` : "Add a note"}</TextLink>
          </dt>
          <dd className="mt-1">
            {notes.items[0] ? (
              <>
                <p className="line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-black">{notes.items[0].body}</p>
                <p className="mt-0.5 text-[11px] text-black/50">{notes.items[0].authorName} · {customerDate(notes.items[0].createdAt)}</p>
              </>
            ) : <p className="text-[13px] text-black/55">No internal notes yet.</p>}
          </dd>
        </div>
      </dl>

      {profile.phone && (
        <div className="flex min-w-0 flex-col gap-2 border-t border-black/[0.07] pt-4 md:col-span-2 xl:col-span-1 xl:border-t-0 xl:pt-0">
          <p className={EYEBROW}>FraudShield</p>
          <FraudPanel phone={profile.phone} compact defaultExpanded alignHeader="left" />
        </div>
      )}
      </div>

      <p className="text-[11px] leading-relaxed text-black/40">{profile.phone ? "Grouped by phone number. A shared number may be more than one person." : "Order-based profile. No name-only matching."}</p>
    </section>
  );

  const overview = (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-[1.35fr_1fr_1fr_1fr]">
        <div className="col-span-2 xl:col-span-1">
          <Stat large label="Delivered order value" value={customerMoney(summary.deliveredValue)} sub={<>of <span className="text-black">{customerMoney(summary.orderValue)}</span> ordered · not collected revenue</>} />
        </div>
        <Stat label="Orders" value={summary.totalOrders} sub={`${summary.deliveredOrders} delivered · ${summary.activeOrders} active`} />
        <Stat label="Avg order" value={customerMoney(summary.averageDeliveredValue)} sub="Fully delivered only" />
        <div className="col-span-2 xl:col-span-1">
          <Stat label="Buys every" value={summary.averagePurchaseIntervalDays === null ? "—" : plural(summary.averagePurchaseIntervalDays, "day")} sub={summary.daysSinceLastPurchase === null ? "Needs two delivered orders" : `Last delivered ${plural(summary.daysSinceLastPurchase, "day")} ago`} />
        </div>
      </div>
      {summary.missingAmounts > 0 && <p className="px-1 text-[11px] text-black/50">{plural(summary.missingAmounts, "order")} {summary.missingAmounts === 1 ? "has" : "have"} no valid amount, so some totals show as unavailable.</p>}

      {outcomeTotal > 0 && (
        <Card title="Order outcomes" action={deliveredShare === null ? undefined : `${deliveredShare}% delivered`}>
          <span role="img" aria-label={`Order outcomes: ${outcomeKeys.map((key) => `${OUTCOME_LABELS[key]} ${outcomeCounts[key]}`).join(", ")}`} className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-black/[0.06]">
            {outcomeKeys.map((key) => <span key={key} className="block h-full min-w-[2px]" style={{ width: `${(outcomeCounts[key] / outcomeTotal) * 100}%`, background: OUTCOME_COLORS[key] }} />)}
          </span>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[12px] tabular-nums">
            {outcomeKeys.map((key) => (
              <span key={key} className={`flex items-center gap-1.5 ${key === "cancelled" || key === "returned" ? RED : "text-black"}`}>
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: OUTCOME_COLORS[key] }} />
                {OUTCOME_LABELS[key]} {outcomeCounts[key]}
              </span>
            ))}
            {summary.pendingReturns > 0 && <span className="text-black/55">{plural(summary.pendingReturns, "return request")} pending</span>}
          </div>
          <p className="text-[11px] leading-relaxed text-black/50">{profile.riskExplanation}</p>
        </Card>
      )}

      <Card title="Recent orders" action={orders.total > recentOrders.length ? <TextLink onClick={() => setTab("orders")}>View all {orders.total}</TextLink> : undefined}>
          <div className="@container">
            <OrderTableHead />
            <ul>{recentOrders.map((entry) => <OrderRow key={`${entry.kind}:${entry.id}`} order={entry} nav={nav} />)}</ul>
            {!recentOrders.length && <p className="text-[13px] text-black/55">No recorded orders.</p>}
          </div>
          <p className="text-[11px] leading-relaxed text-black/45">Totals may include copied inbox orders; there is no reliable cross-channel conversion link yet. Dates are order placement, not delivery.</p>
      </Card>

      <div className="flex flex-col gap-3">
          <Card title="Buys most" action="Delivered orders">
            {profile.products.length ? (
              <ul className="flex flex-col gap-2">
                {profile.products.slice(0, 5).map((product) => (
                  <li key={product.name} className="flex justify-between gap-3 text-[13px]">
                    <span className="min-w-0 break-words text-black">{product.name}</span>
                    <span className="shrink-0 text-[12px] text-black/55 tabular-nums">{plural(product.orders, "order")}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[13px] text-black/55">No delivered product history yet.</p>}
          </Card>
      </div>
    </div>
  );

  const orderHistory = (
    <div className="flex flex-col gap-3">
      {summary.activeOrders > 0 && (
        <Card title="Active orders" action={`Latest ${activeOrders.length} of ${summary.activeOrders}`}>
          <div className="@container"><OrderTableHead /><ul>{activeOrders.map((entry) => <OrderRow key={`${entry.kind}:${entry.id}`} order={entry} nav={nav} />)}</ul></div>
        </Card>
      )}
      <Card title="All orders" action={`${orders.total} across all channels`}>
        <div aria-busy={query.isFetching} className="@container">
          <OrderTableHead />
          <ul>{orders.items.map((entry) => <OrderRow key={`${entry.kind}:${entry.id}`} order={entry} nav={nav} />)}</ul>
        </div>
        <Pager data={orders} label="Orders" onChange={setOrdersPage} busy={query.isFetching} />
      </Card>
    </div>
  );

  const activityPanel = (
    <Card title="Recorded activity" action="Saved order events only">
      {activity.total ? (
        <ol>
          {activity.items.map((event) => (
            <li key={event.id} className="border-t border-black/[0.07] py-3 first:border-t-0 first:pt-0">
              <Link to={customerOrderHref({ id: event.orderId, kind: event.kind })} state={nav} className={`break-words rounded text-[13px] text-black hover:underline hover:underline-offset-4 ${FOCUS}`}>{event.summary}</Link>
              <p className="mt-0.5 text-[11px] text-black/50">{event.actorName} · {customerDate(event.createdAt)}</p>
            </li>
          ))}
        </ol>
      ) : <p className="text-[13px] text-black/55">No recorded order activity.</p>}
      <Pager data={activity} label="Activity" onChange={setActivityPage} busy={query.isFetching} />
    </Card>
  );

  return (
    <div className="min-h-full bg-[#FAFAF8] p-2 lg:p-3">
      <div className="flex flex-col gap-3">
        {rail}
        <motion.main initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex min-w-0 flex-col gap-3">
          {query.error && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-[#B4473A]/[0.06] px-4 py-2.5 text-[13px] text-[#B4473A]">
              {query.error.message}
              <Button variant="secondary" size="small" onClick={() => query.refetch()}>Retry</Button>
            </div>
          )}
          <div role="tablist" aria-label="Customer sections" className="flex gap-6 border-b border-black/[0.08] px-1">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                id={`customer-tab-${entry.id}`}
                aria-selected={tab === entry.id}
                aria-controls={`customer-panel-${entry.id}`}
                onClick={() => setTab(entry.id)}
                className={`relative h-10 shrink-0 whitespace-nowrap text-[13px] font-medium transition-colors ${FOCUS} ${tab === entry.id ? "text-black" : "text-black/50 hover:text-black"}`}
              >
                {entry.label}
                {entry.count ? <span className="ml-1.5 text-black/40 tabular-nums">{entry.count}</span> : null}
                {tab === entry.id && <motion.span layoutId="customer-tab-underline" className="absolute inset-x-0 -bottom-px h-0.5 bg-black" />}
              </button>
            ))}
          </div>
          {/* Panels stay mounted so note and context drafts survive tab switches. */}
          <div role="tabpanel" id="customer-panel-overview" aria-labelledby="customer-tab-overview" hidden={tab !== "overview"}>{overview}</div>
          <div role="tabpanel" id="customer-panel-orders" aria-labelledby="customer-tab-orders" hidden={tab !== "orders"}>{orderHistory}</div>
          <div role="tabpanel" id="customer-panel-notes" aria-labelledby="customer-tab-notes" hidden={tab !== "notes"} className={tab === "notes" ? "grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]" : "hidden"}>
            <CustomerContext key={customerId} customerId={customerId} context={context} notes={notes} onSaved={invalidate} onNotesPage={setNotesPage} onReload={async () => { const result = await query.refetch(); if (result.error) throw result.error; if (!result.data) throw new Error("Could not reload context"); return result.data.context; }} />
          </div>
          <div role="tabpanel" id="customer-panel-activity" aria-labelledby="customer-tab-activity" hidden={tab !== "activity"}>{activityPanel}</div>
        </motion.main>
      </div>
      <CustomerSmsDialog open={smsOpen} onOpenChange={setSmsOpen} recipients={[{ id: customerId, name: profile.name }]} withoutPhone={profile.phone ? 0 : 1} onSent={() => { void invalidate(); }} />
    </div>
  );
}
