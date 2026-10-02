import { customerOrderOutcome, customerReturnPending } from "./customerOutcomes.js";
import { classifyBusinessReportOutcome, normalizeBusinessReportSource, resolveBusinessReportRequest } from "./businessReport.js";
import { computeOrderCogs } from "./cog.js";
import { hashAbandonedCheckoutDraftKey } from "./abandonedCheckouts.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" });
const state = (value) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
const scalar = (value) => value === null || ["string", "number", "boolean"].includes(typeof value);
const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;
const REVENUE_REASONS = new Set(["partial_delivery_amount_unknown", "order_price_missing"]);
const LINK_FIELDS = ["id", "slug", "name", "channel", "destination_path", "creator_name", "post_url", "notes", "created_by", "created_at", "updated_at", "archived_at"];
const PROFIT_BASIS = "Merchandise contribution before ads, using current catalog costs and recorded courier fees on all selected orders. Excludes collected shipping income, packaging, overhead and unrecorded adjustments. Current cost edits can restate historical estimates; missing fees mean a recorded-fees-only estimate.";

function dhakaDay(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(dayFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function resolveCampaignReportRequest({ from, to } = {}) {
  const today = dhakaDay(new Date());
  const dates = from == null && to == null ? { from: today, to: today } : { from, to };
  return { ...resolveBusinessReportRequest(dates), date_basis: "click", as_of: new Date().toISOString() };
}

export function classifyCampaignOutcome(order = {}) {
  const values = [order.status, order.courier_status, order.fulfillment_status, order.return_status].map(state);
  const result = (outcome, delivery_kind = null, amount_incomplete_reason = null) => ({ outcome, delivery_kind, amount_incomplete_reason });
  if (["returned", "completed"].includes(state(order.return_status))) return result("returned");
  const unresolved = customerReturnPending(order)
    || /pending|approval|request|review/.test(state(order.return_status))
    || values.some((value) => /(?:return|deliver)/.test(value) && /pending|approval|request|review/.test(value));
  if (unresolved) {
    // Reuse Business Report approval vocabulary after removing uncertain terminal
    // shortcuts. An independently confirmed/fulfilled order remains confirmed.
    const approval = { ...order, return_status: null };
    for (const key of ["status", "courier_status", "fulfillment_status"]) {
      const value = state(order[key]);
      if (value.includes("return") || /pending|approval|request|review/.test(value)) approval[key] = null;
    }
    return result(classifyBusinessReportOutcome(approval) === "approved" ? "confirmed" : "pending");
  }
  const customerOutcome = customerOrderOutcome(order);
  const businessOutcome = classifyBusinessReportOutcome(order);
  if (customerOutcome === "returned" || businessOutcome === "returned") return result("returned");
  if (customerOutcome === "cancelled" || businessOutcome === "cancelled") return result("cancelled");
  if (customerOutcome === "partial_delivered") return result("delivered", "partial", "partial_delivery_amount_unknown");
  if (customerOutcome === "delivered") return result("delivered", "full");
  return result(businessOutcome === "approved" ? "confirmed" : "pending");
}

function poisha(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const number = Number(value);
  const rounded = Math.round((number + Number.EPSILON) * 100);
  return Number.isFinite(number) && Number.isSafeInteger(rounded) ? rounded : null;
}

function pickScalars(input, fields) {
  const result = {};
  for (const field of fields) if (Object.hasOwn(input, field) && scalar(input[field])) result[field] = input[field];
  return result;
}

function inInterval(value, request) {
  if (value === null || value === undefined || value === "") return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= Date.parse(request.since) && timestamp < Date.parse(request.until);
}

function checkoutHash(checkout) {
  return checkout.draft_key_hash || checkout.abandoned_draft_key_hash || hashAbandonedCheckoutDraftKey(checkout.draft_key);
}

function costForOrder(order, items, products, productsById, productsByName) {
  let input = order.product;
  let costProducts = products;
  let invalidQuantity = false;
  if (items.length) {
    // Synthetic, exact-only helper names preserve IDs and quantities, while
    // avoiding fuzzy matches to stale summaries (or another product's name).
    costProducts = [];
    input = items.map((item, index) => {
      const quantity = Number(item.quantity);
      const validQuantity = Number.isSafeInteger(quantity) && quantity > 0;
      if (!validQuantity) invalidQuantity = true;
      const token = `campaignitem${index}end`;
      const product = item.product_id ? productsById.get(item.product_id)
        : productsByName.get(String(item.product_name ?? "").trim().toLowerCase());
      const cost = validQuantity ? poisha(product?.cog) : null;
      costProducts.push({ name: token, cog: cost !== null && cost > 0 ? cost / 100 : null });
      return `${validQuantity ? quantity : 1}x ${token}`;
    }).join(", ");
  }
  const computed = computeOrderCogs([{ id: order.id, product: input }], costProducts);
  // Costs are normalized to integer poisha per unit before calling the helper.
  // Convert its order contribution once, then aggregate only integer amounts.
  const amount = poisha(computed.totalCog);
  const complete = computed.coverage.total > 0 && computed.coverage.set === computed.coverage.total && !invalidQuantity && amount !== null;
  const reason = invalidQuantity ? "invalid_order_item_quantity"
    : !computed.coverage.total ? "missing_order_items" : amount === null ? "invalid_cost_amount" : !complete ? "missing_product_cost" : null;
  // The existing helper returns a partial known total; completeness decides
  // whether it can become delivered COGS, retaining its legacy match semantics.
  return { amount: complete ? amount : null, coverage: computed.coverage, reason };
}

function orderContribution(order, items, costs) {
  const classification = classifyCampaignOutcome(order);
  const price = poisha(order.price);
  const fee = poisha(order.courier_fee);
  const delivered = classification.outcome === "delivered";
  const partial = classification.delivery_kind === "partial";
  const cost = delivered ? costForOrder(order, items, ...costs) : { amount: 0, coverage: { set: 0, total: 0 }, reason: null };
  return {
    ...classification, price, fee,
    revenue: delivered ? partial ? null : price : 0,
    cogs: partial ? null : cost.amount,
    coverage: cost.coverage,
    revenueReason: partial ? "partial_delivery_amount_unknown" : delivered && price === null ? "order_price_missing" : null,
    cogsReason: partial ? "partial_delivery_quantities_unknown" : cost.reason,
    order,
  };
}

function createBucket() {
  return {
    clicks: new Set(), visitors: new Set(), drafts: new Set(), orders: new Map(), converted: new Set(),
    amounts: { value: 0, revenue: 0, cogs: 0, fees: 0 },
    outcomes: { pending: 0, confirmed: 0, delivered: 0, cancelled: 0, returned: 0 },
    revenueReasons: new Set(), cogsReasons: new Set(), valueReasons: new Set(),
    coverage: { set: 0, total: 0, complete_orders: 0, total_orders: 0 }, recordedFees: 0,
  };
}

function addClick(bucket, click) {
  bucket.clicks.add(click.id);
  if (typeof click.visitor_hash === "string" && click.visitor_hash) bucket.visitors.add(click.visitor_hash);
}

function addContribution(bucket, contribution, clickId = null) {
  const { order, price, revenue, cogs, fee, coverage } = contribution;
  if (bucket.orders.has(order.id)) return;
  bucket.orders.set(order.id, contribution);
  if (clickId) bucket.converted.add(clickId);
  bucket.outcomes[contribution.outcome] += 1;
  if (price === null) bucket.valueReasons.add("order_price_missing");
  else bucket.amounts.value += price;
  if (revenue !== null) bucket.amounts.revenue += revenue;
  if (cogs !== null) bucket.amounts.cogs += cogs;
  if (fee !== null) { bucket.recordedFees += 1; bucket.amounts.fees += fee; }
  if (contribution.revenueReason) bucket.revenueReasons.add(contribution.revenueReason);
  if (contribution.cogsReason) bucket.cogsReasons.add(contribution.cogsReason);
  bucket.coverage.set += coverage.set;
  bucket.coverage.total += coverage.total;
  if (contribution.outcome === "delivered") {
    bucket.coverage.total_orders += 1;
    if (cogs !== null) bucket.coverage.complete_orders += 1;
  }
}

function recentOrder(contribution) {
  const { order, price, revenue, cogs, fee } = contribution;
  return {
    ...pickScalars(order, ["id", "order_number", "created_at", "campaign_link_id", "campaign_click_id", "campaign_attributed_at"]),
    outcome: contribution.outcome, delivery_kind: contribution.delivery_kind,
    amount_incomplete_reason: contribution.amount_incomplete_reason,
    order_value: price === null ? null : price / 100,
    delivered_revenue: revenue === null ? null : revenue / 100,
    delivered_cogs: cogs === null ? null : cogs / 100,
    courier_fees: fee === null ? null : fee / 100,
    estimated_delivered_profit: revenue === null || cogs === null ? null : (revenue - cogs - (fee ?? 0)) / 100,
    revenue_incomplete_reasons: contribution.revenueReason ? [contribution.revenueReason] : [],
    cogs_incomplete_reasons: contribution.cogsReason ? [contribution.cogsReason] : [],
  };
}

function finalize(bucket, includeRecent = false) {
  const revenueComplete = bucket.revenueReasons.size === 0;
  const cogsComplete = bucket.cogsReasons.size === 0;
  const profitReasons = [...new Set([...bucket.revenueReasons, ...bucket.cogsReasons])];
  const orders = bucket.orders.size;
  return {
    clicks: bucket.clicks.size, estimated_visitor_days: bucket.visitors.size,
    captured_checkouts: orders + bucket.drafts.size, orders,
    converted_clicks: bucket.converted.size, ...bucket.outcomes,
    order_value: bucket.valueReasons.size ? null : bucket.amounts.value / 100,
    delivered_revenue: revenueComplete ? bucket.amounts.revenue / 100 : null,
    delivered_cogs: cogsComplete ? bucket.amounts.cogs / 100 : null,
    courier_fees: bucket.amounts.fees / 100,
    estimated_delivered_profit: revenueComplete && cogsComplete ? (bucket.amounts.revenue - bucket.amounts.cogs - bucket.amounts.fees) / 100 : null,
    click_to_order: ratio(bucket.converted.size, bucket.clicks.size),
    order_to_delivered: ratio(bucket.outcomes.delivered, orders),
    loss_rate: ratio(bucket.outcomes.cancelled + bucket.outcomes.returned, orders),
    revenue_complete: revenueComplete, revenue_incomplete_reasons: [...bucket.revenueReasons],
    order_value_incomplete_reasons: [...bucket.valueReasons],
    cogs_complete: cogsComplete, cogs_incomplete_reasons: [...bucket.cogsReasons],
    profit_incomplete_reasons: profitReasons, cogs_coverage: { ...bucket.coverage },
    courier_fee_coverage: { recorded_orders: bucket.recordedFees, total_orders: orders },
    ...(includeRecent ? { has_more: orders > 50, recent_orders: [...bucket.orders.values()].sort((x, y) => Date.parse(y.order.created_at) - Date.parse(x.order.created_at) || String(x.order.id).localeCompare(String(y.order.id))).slice(0, 50).map(recentOrder) } : {}),
  };
}

// All input arrays are server-loaded workspace projections, never raw client data.
// checkoutOrderLinks MUST be workspace-wide, not restricted to selected clicks.
export function buildCampaignReport({ links = [], clicks = [], checkouts = [], orders = [], unattributedOrders = [], checkoutOrderLinks = [], orderItems = [], products = [], request = resolveCampaignReportRequest() } = {}) {
  const dates = resolveCampaignReportRequest(request.range ?? request);
  request = { ...request, range: dates.range, since: dates.since, until: dates.until };
  const orgId = request.orgId || links[0]?.org_id;
  const linksById = new Map(links.filter((link) => link.id && link.org_id === orgId).map((link) => [link.id, link]));
  const bucketsByLink = new Map([...linksById.keys()].map((id) => [id, createBucket()]));
  const dailyBuckets = new Map();
  for (let time = Date.parse(`${request.range.from}T00:00:00Z`); time <= Date.parse(`${request.range.to}T00:00:00Z`); time += DAY_MS) {
    dailyBuckets.set(new Date(time).toISOString().slice(0, 10), createBucket());
  }
  const totalBucket = createBucket();
  const clicksById = new Map();
  for (const click of clicks) {
    if (!click.id || clicksById.has(click.id) || click.is_bot !== false || click.org_id !== orgId || !linksById.has(click.link_id) || !inInterval(click.clicked_at, request)) continue;
    clicksById.set(click.id, click);
    for (const bucket of [bucketsByLink.get(click.link_id), totalBucket, dailyBuckets.get(dhakaDay(click.clicked_at))]) addClick(bucket, click);
  }
  const linkedDraftIds = new Set();
  const linkedDraftHashes = new Set();
  for (const order of [...orders, ...unattributedOrders, ...checkoutOrderLinks]) {
    if (order.org_id !== undefined && order.org_id !== orgId) continue;
    if (order.abandoned_checkout_id) linkedDraftIds.add(order.abandoned_checkout_id);
    if (order.abandoned_draft_key_hash) linkedDraftHashes.add(order.abandoned_draft_key_hash);
  }
  const itemsByOrder = new Map();
  for (const item of orderItems) {
    if (item.org_id !== undefined && item.org_id !== orgId) continue;
    const items = itemsByOrder.get(item.order_id) || [];
    items.push(item);
    itemsByOrder.set(item.order_id, items);
  }
  const scopedProducts = products.filter((product) => product.org_id === undefined || product.org_id === orgId).map((product) => {
    const cost = poisha(product.cog);
    return { ...product, cog: cost !== null && cost > 0 ? cost / 100 : null };
  });
  const productsById = new Map(scopedProducts.map((product) => [product.id, product]));
  const productsByName = new Map(scopedProducts.map((product) => [String(product.name ?? "").trim().toLowerCase(), product]));
  const costs = [scopedProducts, productsById, productsByName];
  const contribution = (order) => orderContribution(order, itemsByOrder.get(order.id) || (Array.isArray(order.order_items) ? order.order_items : []), costs);
  for (const order of orders) {
    const click = clicksById.get(order.campaign_click_id);
    if (!order.id || order.org_id !== orgId || !click || order.campaign_link_id !== click.link_id || totalBucket.orders.has(order.id)) continue;
    // Intake already validated/froze attribution. Approval date cannot expire it.
    const value = contribution(order);
    for (const bucket of [bucketsByLink.get(click.link_id), totalBucket, dailyBuckets.get(dhakaDay(click.clicked_at))]) addContribution(bucket, value, click.id);
  }
  const seenDraftIds = new Set();
  const seenDraftHashes = new Set();
  for (const checkout of checkouts) {
    const click = clicksById.get(checkout.campaign_click_id);
    const hash = checkoutHash(checkout);
    if (!checkout.id || checkout.org_id !== orgId || !click || checkout.campaign_link_id !== click.link_id
      || linkedDraftIds.has(checkout.id) || hash && linkedDraftHashes.has(hash)
      || seenDraftIds.has(checkout.id) || hash && seenDraftHashes.has(hash)) continue;
    seenDraftIds.add(checkout.id);
    if (hash) seenDraftHashes.add(hash);
    for (const bucket of [bucketsByLink.get(click.link_id), totalBucket, dailyBuckets.get(dhakaDay(click.clicked_at))]) bucket.drafts.add(checkout.id);
  }
  const comparisonBucket = createBucket();
  for (const order of unattributedOrders) {
    if (!order.id || order.org_id !== orgId || order.campaign_click_id || order.campaign_link_id
      || normalizeBusinessReportSource(order.source) !== "website" || !inInterval(order.created_at, request) || comparisonBucket.orders.has(order.id)) continue;
    addContribution(comparisonBucket, contribution(order));
  }
  const totals = finalize(totalBucket);
  return {
    rows: [...linksById.values()].map((link) => ({ ...pickScalars(link, LINK_FIELDS), ...finalize(bucketsByLink.get(link.id), true) })),
    totals,
    unattributed: { label: "Unattributed website orders placed in this period", date_basis: "order_created", ...finalize(comparisonBucket, true) },
    daily: [...dailyBuckets].map(([day, bucket]) => ({ day, ...finalize(bucket) })),
    meta: {
      range: { ...request.range }, date_basis: "click", as_of: request.as_of || dates.as_of,
      attribution_window_days: 30, provisional: true, order_series_label: "Orders from these clicks",
      revenue_complete: totals.revenue_complete, revenue_incomplete_reasons: [...totals.revenue_incomplete_reasons],
      cogs_coverage: { ...totals.cogs_coverage }, courier_fee_coverage: { ...totals.courier_fee_coverage },
      cogs_incomplete_reasons: [...totals.cogs_incomplete_reasons], profit_incomplete_reasons: [...totals.profit_incomplete_reasons],
      profit_basis: PROFIT_BASIS,
    },
  };
}

// Deliberately explicit, typed-depth allowlists: adding an admin field cannot
// accidentally expose it to staff, including inside otherwise allowed scalars.
const TEAM_METRIC_FIELDS = ["clicks", "estimated_visitor_days", "captured_checkouts", "orders", "converted_clicks", "pending", "confirmed", "delivered", "cancelled", "returned", "order_value", "delivered_revenue", "click_to_order", "order_to_delivered", "loss_rate", "revenue_complete"];
const TEAM_ROW_FIELDS = [...LINK_FIELDS, ...TEAM_METRIC_FIELDS, "day", "label", "date_basis", "order_number", "outcome", "delivery_kind", "campaign_link_id", "campaign_click_id", "campaign_attributed_at", "has_more"];
const TEAM_META_FIELDS = ["date_basis", "as_of", "attribution_window_days", "provisional", "order_series_label", "revenue_complete"];

function projectReasons(input, output) {
  for (const key of ["revenue_incomplete_reasons", "order_value_incomplete_reasons"]) {
    if (Array.isArray(input[key])) output[key] = input[key].filter((reason) => REVENUE_REASONS.has(reason));
  }
  if (input.amount_incomplete_reason === null || REVENUE_REASONS.has(input.amount_incomplete_reason)) output.amount_incomplete_reason = input.amount_incomplete_reason;
}

function projectMeta(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = pickScalars(input, TEAM_META_FIELDS);
  projectReasons(input, output);
  if (input.range && typeof input.range === "object") output.range = pickScalars(input.range, ["from", "to"]);
  return output;
}

export function redactCampaignFinancials(report) {
  if (Array.isArray(report)) return report.map(redactCampaignFinancials);
  if (!report || typeof report !== "object") return report === null ? null : {};
  const output = pickScalars(report, TEAM_ROW_FIELDS);
  projectReasons(report, output);
  for (const key of ["rows", "daily", "recent_orders"]) {
    if (Array.isArray(report[key])) output[key] = report[key].map(redactCampaignFinancials);
  }
  for (const key of ["totals", "unattributed", "link", "metrics", "report", "data"]) {
    if (report[key] && typeof report[key] === "object") output[key] = redactCampaignFinancials(report[key]);
  }
  if (report.meta && typeof report.meta === "object") output.meta = projectMeta(report.meta);
  return output;
}
