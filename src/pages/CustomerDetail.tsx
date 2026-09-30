import { useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, ChatCircle, MapPin, Phone, Plus, UserCircle } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { CustomerSmsDialog } from "@/components/CustomerSmsDialog";
import { CustomerContext } from "@/components/customer-profile/CustomerContext";
import { FraudPanel } from "@/components/order-editor/FraudPanel";
import { customerDate, customerMoney, customerOrderHref, type CustomerHistoryOrder, type CustomerProfileResponse, type ProfilePage } from "@/lib/customerProfile";
import { orderSourceLabel } from "@/lib/orderSource";

function Section({ title, children, description }: { title: string; children: ReactNode; description?: string }) {
  return <section className="border-t border-black/10 pt-6"><h2 className="text-base font-medium">{title}</h2>{description && <p className="mt-1 text-xs leading-relaxed text-black/60">{description}</p>}<div className="mt-4">{children}</div></section>;
}
function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <div className="min-w-0 py-3"><p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">{label}</p><p className="mt-2 break-words text-2xl font-light tabular-nums">{value}</p>{hint && <p className="mt-1 text-xs text-black/60">{hint}</p>}</div>;
}
function Pager({ data, label, onChange, busy }: { data: ProfilePage<unknown>; label: string; onChange: (page: number) => void; busy: boolean }) {
  if (data.totalPages <= 1) return null;
  return <nav aria-label={`${label} pagination`} className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs"><Button variant="ghost" disabled={busy || data.page <= 1} onClick={() => onChange(data.page - 1)}>Previous {label.toLowerCase()}</Button><span>Page {data.page} of {data.totalPages} · {data.total} records</span><Button variant="ghost" disabled={busy || data.page >= data.totalPages} onClick={() => onChange(data.page + 1)}>Next {label.toLowerCase()}</Button></nav>;
}
function OrderRow({ order, profilePath, profileNavigationState }: { order: CustomerHistoryOrder; profilePath: string; profileNavigationState?: { customerListState: unknown } }) {
  return <li className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
    <div className="min-w-0"><Link to={customerOrderHref(order)} state={{ from: profilePath, profileNavigationState }} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium underline decoration-black/20 underline-offset-4 hover:decoration-black">{order.orderNumber || (order.kind === "social_order" ? "Inbox order" : "Order")}<ArrowUpRight weight="light" size={14} aria-hidden="true" /></Link><p className="mt-1 break-words text-sm text-black/70">{order.products.map((product) => `${product.name}${product.quantity === null ? "" : ` ×${product.quantity}`}`).join(", ") || "Product details unavailable"}</p><p className="mt-1 text-xs text-black/60">{customerDate(order.createdAt)} · {orderSourceLabel(order.source)}</p>
      {(order.courierName || order.trackingCode || order.consignmentId) && <p className="mt-2 break-all text-xs text-black/65">{order.courierName || "Courier not recorded"}{order.trackingCode ? ` · Tracking ${order.trackingCode}` : order.consignmentId ? ` · Consignment ${order.consignmentId}` : ""}{order.courierStatus ? ` · ${order.courierStatus.replace(/_/g, " ")}` : ""}</p>}
      {order.pendingReturn && <p className="mt-1 text-xs text-amber-800">Return requested; completion not confirmed</p>}
    </div><div className="flex items-center gap-3 sm:flex-col sm:items-end"><span className="text-sm tabular-nums">{customerMoney(order.amount)}</span><span className="text-xs capitalize text-black/65">{order.outcome === "active" ? order.status.replace(/_/g, " ") : order.outcome.replace(/_/g, " ")}</span></div>
  </li>;
}

export default function CustomerDetail() {
  const { id = "" } = useParams();
  // A changed route identity remounts all drafts and pagination together.
  return <CustomerDetailContent key={id} customerId={id} />;
}
function CustomerDetailContent({ customerId }: { customerId: string }) {
  const location = useLocation();
  const queryClient = useQueryClient();
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
  const back = <Link to="/customers" state={backState ? { customerListState: backState } : undefined} className="inline-flex min-h-10 items-center gap-2 text-sm text-black/65 hover:text-black"><ArrowLeft weight="light" size={16} aria-hidden="true" />Customers</Link>;
  if (query.isPending) return <div className="p-4 sm:p-6">{back}<p role="status" className="py-12 text-sm">Loading customer profile…</p></div>;
  if (query.error && !query.data) return <div className="p-4 sm:p-6">{back}<h1 className="mt-6 text-xl font-medium">Customer profile unavailable</h1><p role="alert" className="my-4 text-sm">{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div>;
  if (!query.data) return null;
  const { profile, context, orders, activeOrders, activity, notes } = query.data;
  const summary = profile.summary;
  const profilePath = `/customers/${encodeURIComponent(customerId)}`;
  const profileNavigationState = { customerListState: backState };
  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: queryPrefix }); };

  return <div className="min-h-full bg-[#FAFAF8] p-4 text-black sm:p-6 lg:p-8">
    {back}
    <header className="mt-4 flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
      <div className="flex min-w-0 gap-3"><UserCircle weight="light" size={42} className="shrink-0 text-black/50" aria-hidden="true" /><div className="min-w-0"><h1 className="break-words text-2xl font-light tracking-tight">{profile.name}</h1><div className="mt-2 flex items-center gap-2 text-sm">{profile.phone || "No valid phone recorded"}{profile.phone && <CopyButton value={profile.phone} aria-label={`Copy phone number ${profile.phone}`} />}</div><p className="mt-2 text-xs leading-relaxed text-black/60">{profile.phone ? "Orders grouped by phone number. A shared number may represent more than one person." : "Separate order-based profile. No name-only identity matching."}</p></div></div>
      <div className="flex flex-wrap gap-2">
        {profile.phone && <Button variant="outline" asChild><a href={`tel:${profile.phone}`}><Phone weight="light" aria-hidden="true" />Call customer</a></Button>}
        <Button variant="outline" disabled={!profile.phone} onClick={() => setSmsOpen(true)}><ChatCircle weight="light" aria-hidden="true" />Send SMS</Button>
        <Button variant="outline" asChild><Link to="/orders/new" state={{ from: profilePath, profileNavigationState, customerPrefill: { customerName: profile.name === "Unknown" ? "" : profile.name, phone: profile.phone, address: profile.latestAddress || "" } }}><Plus weight="light" aria-hidden="true" />Create order</Link></Button>
      </div>
    </header>
    {query.error && <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-red-700">{query.error.message}<Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div>}

    <div className="mt-7 grid gap-x-5 border-y border-black/10 py-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Recorded orders" value={summary.totalOrders} hint={`${summary.activeOrders} active · ${summary.deliveredOrders} fully delivered`} />
      <Metric label="Delivered order value" value={customerMoney(summary.deliveredValue)} hint="Fully delivered only; not collected revenue" />
      <Metric label="Average delivered order" value={customerMoney(summary.averageDeliveredValue)} hint="Excludes partial, cancelled and returned orders" />
      <Metric label="Last delivered purchase" value={summary.daysSinceLastPurchase === null ? "Unavailable" : `${summary.daysSinceLastPurchase} days ago`} hint={customerDate(profile.lastPurchaseAt)} />
    </div>
    <p className="mt-3 text-xs leading-relaxed text-black/60">Totals reflect recorded orders and may include copied inbox orders. The current data has no reliable cross-channel conversion link. Dates refer to order placement, not delivery confirmation.</p>

    <div className="mt-8 grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-8">
        <Section title="Customer information"><dl className="grid gap-5 sm:grid-cols-2"><div><dt className="text-xs text-black/60">Latest delivery address</dt><dd className="mt-2 flex items-start gap-2 text-sm leading-relaxed"><MapPin weight="light" size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{profile.latestAddress || "No delivery address recorded"}</dd></div><div><dt className="text-xs text-black/60">Order channels</dt><dd className="mt-2 text-sm">{profile.sources.map(orderSourceLabel).join(", ")}</dd></div><div><dt className="text-xs text-black/60">First recorded order</dt><dd className="mt-2 text-sm">{customerDate(profile.firstOrderAt)}</dd></div><div><dt className="text-xs text-black/60">Latest recorded order</dt><dd className="mt-2 text-sm">{customerDate(profile.lastOrderAt)}</dd></div></dl>{profile.addresses.length > 1 && <details className="mt-5 text-sm"><summary className="min-h-9 cursor-pointer">Previous delivery addresses</summary><ul className="mt-3 space-y-3">{profile.addresses.slice(1).map((entry) => <li key={entry.address}><p>{entry.address}</p><p className="mt-1 text-xs text-black/60">Last used {customerDate(entry.lastUsedAt)} · {entry.orders} orders</p></li>)}</ul></details>}</Section>

        <Section title="Delivery and local risk" description={profile.riskExplanation}><div className="flex flex-wrap items-center gap-4 text-sm"><span className="capitalize">{profile.riskLevel} local risk</span><span>{summary.cancelledOrders} cancelled</span><span>{summary.returnedOrders} returned</span><span>{summary.partialDeliveredOrders} partial deliveries</span><span>{summary.pendingReturns} return requests pending</span></div><p className="mt-3 text-xs text-black/60">Outcomes use saved order and courier statuses. Earlier courier integrations may have simplified return states; check the underlying order before dispatch.</p></Section>

        {summary.activeOrders > 0 && <Section title="Active orders" description={`Showing the latest ${activeOrders.length} of ${summary.activeOrders}. Open an order to handle it.`}><ul className="divide-y divide-black/10">{activeOrders.map((entry) => <OrderRow key={`${entry.kind}:${entry.id}`} order={entry} profilePath={profilePath} profileNavigationState={profileNavigationState} />)}</ul></Section>}

        <Section title="Order history" description={`${orders.total} recorded orders across all channels`}><div aria-busy={query.isFetching}><ul className="divide-y divide-black/10">{orders.items.map((entry) => <OrderRow key={`${entry.kind}:${entry.id}`} order={entry} profilePath={profilePath} profileNavigationState={profileNavigationState} />)}</ul><Pager data={orders} label="Orders" onChange={setOrdersPage} busy={query.isFetching} /></div></Section>

        <Section title="Purchase patterns" description="Based on fully delivered orders, not abandoned or cancelled purchases."><div className="grid gap-4 sm:grid-cols-2"><Metric label="Total recorded order value" value={customerMoney(summary.orderValue)} /><Metric label="Average purchase interval" value={summary.averagePurchaseIntervalDays === null ? "Unavailable" : `${summary.averagePurchaseIntervalDays} days`} hint="Requires at least two dated delivered orders" /></div>{summary.missingAmounts > 0 && <p className="mt-2 text-xs text-black/60">{summary.missingAmounts} orders have no valid amount. Incomplete totals show as unavailable.</p>}<ul className="mt-3 divide-y divide-black/10">{profile.products.slice(0, 10).map((product) => <li key={product.name} className="flex justify-between gap-3 py-3 text-sm"><span className="break-words">{product.name}</span><span className="shrink-0 text-xs text-black/60">{product.orders} orders · {product.quantity === null ? "quantity unknown" : `${product.quantity} units`}</span></li>)}</ul>{!profile.products.length && <p className="mt-3 text-sm text-black/60">No delivered product history available.</p>}<p className="mt-5 text-sm leading-relaxed">{profile.suggestion}</p></Section>

        <Section title="Calculated segments" description="Existing rules, not manually assigned tags or automatic campaign instructions."><p className="text-sm capitalize">Lifecycle: {profile.lifecycleStage}</p><p className="mt-2 text-sm leading-relaxed">{profile.campaignSegments.map((segment) => segment.replace(/_/g, " ")).join(" · ") || "No campaign segments"}</p><p className="mt-3 text-xs leading-relaxed text-black/60">The current dormant rule uses 45 days without an order. Seasonal purchases, including mangoes, need staff judgment before a win-back message.</p></Section>

        <Section title="Recorded activity" description="Saved order events only. Earlier activity and customer SMS history may be incomplete."><ol className="divide-y divide-black/10">{activity.items.map((event) => <li key={event.id} className="py-3"><Link to={customerOrderHref({ id: event.orderId, kind: event.kind })} state={{ from: profilePath, profileNavigationState }} className="break-words text-sm underline decoration-black/20 underline-offset-4">{event.summary}</Link><p className="mt-1 text-xs text-black/60">{event.actorName} · {customerDate(event.createdAt)}</p></li>)}</ol>{!activity.total && <p className="text-sm text-black/60">No recorded order activity available.</p>}<Pager data={activity} label="Activity" onChange={setActivityPage} busy={query.isFetching} /></Section>
      </div>
      <aside className="min-w-0 space-y-8 border-t border-black/10 pt-6 xl:border-t-0 xl:pt-0" aria-label="Customer staff tools">
        {profile.phone && <section><h2 className="mb-4 text-base font-medium">FraudShield history</h2><FraudPanel phone={profile.phone} compact defaultExpanded alignHeader="left" /><p className="mt-3 text-xs text-black/60">Opening this profile reads the saved check only. Check or re-check explicitly to request fresh data.</p></section>}
        <CustomerContext key={customerId} customerId={customerId} context={context} notes={notes} onSaved={invalidate} onNotesPage={setNotesPage} onReload={async () => { const result = await query.refetch(); if (result.error) throw result.error; if (!result.data) throw new Error("Could not reload context"); return result.data.context; }} />
      </aside>
    </div>
    <CustomerSmsDialog open={smsOpen} onOpenChange={setSmsOpen} recipients={[{ id: customerId, name: profile.name }]} withoutPhone={profile.phone ? 0 : 1} onSent={() => { void invalidate(); }} />
  </div>;
}
