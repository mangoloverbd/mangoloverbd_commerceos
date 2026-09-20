import { toDhakaInterval } from "./reports.js";

const SOURCE_OPTIONS = [
  ["website", "Website"],
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["whatsapp", "WhatsApp"],
  ["phone", "Phone"],
  ["telesales", "Telesales"],
  ["manual_other", "Manual / Other"],
];

const SOURCE_LABELS = new Map(SOURCE_OPTIONS);
const WEBSITE_ALIASES = new Set([
  "custom_store",
  "custom_website",
  "custom_website_tracker",
  "storefront",
  "storefront_review",
  "webhook",
  "website",
]);
const CANCELLED_STATES = new Set(["cancelled", "canceled", "rejected"]);
const APPROVED_STATES = new Set([
  "approved",
  "confirmed",
  "print",
  "processing",
  "fulfilled",
  "delivered",
  "partial_delivered",
]);
const PENDING_RETURN_MARKERS = ["request", "pending", "approval", "review"];
const LANDING_PAGE_PATH_RE = /^\/step\/[a-z0-9]+(?:-[a-z0-9]+)*$/i;

const dhakaDateHourFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dhaka",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});
const dhakaDayLabelFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Dhaka",
  month: "short",
  day: "numeric",
});

function invalidBusinessReportRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeStatus(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string" || !value.trim()) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function hasRecordedCourierFee(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string" || !value.trim()) return false;
  return Number.isFinite(Number(value));
}

function toDhakaParts(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;

  const parts = Object.fromEntries(
    dhakaDateHourFormatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  if (!parts.year || !parts.month || !parts.day || !Number.isInteger(hour)) return null;

  return {
    timestamp,
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
  };
}

function addDaysYmd(day, days) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayLabel(day) {
  return dhakaDayLabelFormatter.format(new Date(`${day}T00:00:00+06:00`));
}

function hourLabel(hour) {
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}${hour < 12 ? "a" : "p"}`;
}

function createMetrics() {
  return {
    intake_count: 0,
    order_value: 0,
    approved_count: 0,
    approved_value: 0,
    cancelled_count: 0,
    cancelled_value: 0,
    returned_count: 0,
    returned_value: 0,
    pending_count: 0,
    pending_value: 0,
    delivery_charged: 0,
    courier_fees_recorded: 0,
    net_delivery_position: 0,
    courier_fee_order_count: 0,
  };
}

function createLandingPageMetrics(path) {
  return {
    path,
    label: path || "Other website",
    intake_count: 0,
    order_value: 0,
    approved_count: 0,
    cancelled_count: 0,
    returned_count: 0,
    pending_count: 0,
  };
}

function addOutcome(metrics, outcome, value) {
  if (outcome === "approved") {
    metrics.approved_count += 1;
    metrics.approved_value += value;
  } else if (outcome === "cancelled") {
    metrics.cancelled_count += 1;
    metrics.cancelled_value += value;
  } else if (outcome === "returned") {
    metrics.returned_count += 1;
    metrics.returned_value += value;
  } else {
    metrics.pending_count += 1;
    metrics.pending_value += value;
  }
}

function addOrderMetrics(metrics, order, outcome, value) {
  metrics.intake_count += 1;
  metrics.order_value += value;
  addOutcome(metrics, outcome, value);

  if (outcome === "approved") {
    metrics.delivery_charged += toNumber(order.delivery_rate);
  }
  if (hasRecordedCourierFee(order.courier_fee)) {
    metrics.courier_fees_recorded += toNumber(order.courier_fee);
    metrics.courier_fee_order_count += 1;
  }
}

function addLandingPageMetrics(metrics, outcome, value) {
  metrics.intake_count += 1;
  metrics.order_value += value;

  if (outcome === "approved") metrics.approved_count += 1;
  else if (outcome === "cancelled") metrics.cancelled_count += 1;
  else if (outcome === "returned") metrics.returned_count += 1;
  else metrics.pending_count += 1;
}

function finalizeMetrics(metrics) {
  metrics.net_delivery_position = metrics.delivery_charged - metrics.courier_fees_recorded;
  return metrics;
}

function sortByValueThenCount(a, b) {
  return b.order_value - a.order_value
    || b.intake_count - a.intake_count
    || a.label.localeCompare(b.label);
}

function createSeriesBucket(key, label) {
  return { key, label, intake_count: 0, order_value: 0 };
}

function addToSeriesBucket(bucket, value) {
  bucket.intake_count += 1;
  bucket.order_value += value;
}

function buildSeries(seriesRows, request) {
  const bucketsByDay = new Map();
  const bucketsByDayHour = new Map();

  for (const row of seriesRows) {
    const dayBucket = bucketsByDay.get(row.day)
      || createSeriesBucket(row.day, dayLabel(row.day));
    addToSeriesBucket(dayBucket, row.value);
    bucketsByDay.set(row.day, dayBucket);

    const dayHourKey = `${row.day}-${row.hour}`;
    const hourBucket = bucketsByDayHour.get(dayHourKey)
      || createSeriesBucket(dayHourKey, hourLabel(row.hour));
    addToSeriesBucket(hourBucket, row.value);
    bucketsByDayHour.set(dayHourKey, hourBucket);
  }

  if (request.range.from && request.range.to && request.range.from === request.range.to) {
    const day = request.range.from;
    return {
      granularity: "hour",
      label: "Intake by hour",
      buckets: Array.from({ length: 24 }, (_, hour) => {
        const key = `${day}-${hour}`;
        return bucketsByDayHour.get(key) || createSeriesBucket(key, hourLabel(hour));
      }),
    };
  }

  if (request.range.from && request.range.to) {
    const buckets = [];
    for (let day = request.range.from; day <= request.range.to; day = addDaysYmd(day, 1)) {
      buckets.push(bucketsByDay.get(day) || createSeriesBucket(day, dayLabel(day)));
    }
    return { granularity: "day", label: "Intake by day", buckets };
  }

  const recentDays = [...bucketsByDay.keys()].sort().slice(-30);
  return {
    granularity: "day",
    label: "Recent intake activity",
    buckets: recentDays.map((day) => bucketsByDay.get(day)),
  };
}

function isWithinRequest(timestamp, request) {
  if (!Number.isFinite(timestamp)) return false;
  if (request.since && timestamp < new Date(request.since).getTime()) return false;
  if (request.until && timestamp >= new Date(request.until).getTime()) return false;
  return true;
}

function isTerminalCourierReturn(courierStatus) {
  return courierStatus.includes("return")
    && !PENDING_RETURN_MARKERS.some((marker) => courierStatus.includes(marker));
}

export function resolveBusinessReportRequest({ from, to } = {}) {
  const hasFrom = from !== undefined && from !== null;
  const hasTo = to !== undefined && to !== null;
  if (hasFrom !== hasTo) {
    throw invalidBusinessReportRequest("Provide both from and to dates");
  }
  if (!hasFrom) {
    return {
      range: { from: null, to: null },
      since: null,
      until: null,
    };
  }

  const interval = toDhakaInterval(from, to);
  if (interval.from > interval.to) {
    throw invalidBusinessReportRequest("Report start date must not be after the end date");
  }
  return {
    range: { from: interval.from, to: interval.to },
    since: interval.since,
    until: interval.until,
  };
}

export function normalizeBusinessReportSource(value) {
  const source = String(value ?? "").trim().toLowerCase();
  if (WEBSITE_ALIASES.has(source)) return "website";
  return SOURCE_LABELS.has(source) ? source : "manual_other";
}

export function normalizeBusinessReportLandingPage(value) {
  if (typeof value !== "string") return null;
  const path = value.trim().split(/[?#]/, 1)[0].replace(/\/+$/, "");
  return path.length <= 120 && LANDING_PAGE_PATH_RE.test(path) ? path : null;
}

export function classifyBusinessReportOutcome(order) {
  const status = normalizeStatus(order?.status);
  const courierStatus = normalizeStatus(order?.courier_status);
  const returnStatus = normalizeStatus(order?.return_status);

  if (CANCELLED_STATES.has(status) || CANCELLED_STATES.has(courierStatus)) {
    return "cancelled";
  }
  if (
    status === "returned"
    || returnStatus === "returned"
    || returnStatus === "completed"
    || isTerminalCourierReturn(courierStatus)
  ) {
    return "returned";
  }
  return APPROVED_STATES.has(status) ? "approved" : "pending";
}

export function buildBusinessReport(orders, request) {
  const summary = createMetrics();
  const sourceGroups = new Map();
  const seriesRows = [];

  for (const order of orders || []) {
    const dhakaParts = toDhakaParts(order?.created_at);
    if (!dhakaParts || !isWithinRequest(dhakaParts.timestamp, request)) continue;

    const source = normalizeBusinessReportSource(order.source);
    const sourceLabel = SOURCE_LABELS.get(source);
    const outcome = classifyBusinessReportOutcome(order);
    const value = toNumber(order.price);
    const sourceGroup = sourceGroups.get(source) || {
      source,
      label: sourceLabel,
      metrics: createMetrics(),
      landingPages: new Map(),
    };

    addOrderMetrics(summary, order, outcome, value);
    addOrderMetrics(sourceGroup.metrics, order, outcome, value);

    if (source === "website") {
      const path = normalizeBusinessReportLandingPage(order.landing_page_path);
      const landingPage = sourceGroup.landingPages.get(path) || createLandingPageMetrics(path);
      addLandingPageMetrics(landingPage, outcome, value);
      sourceGroup.landingPages.set(path, landingPage);
    }

    sourceGroups.set(source, sourceGroup);
    seriesRows.push({ day: dhakaParts.day, hour: dhakaParts.hour, value });
  }

  const sources = [...sourceGroups.values()]
    .map(({ source, label, metrics, landingPages }) => ({
      source,
      label,
      ...finalizeMetrics(metrics),
      landing_pages: source === "website"
        ? [...landingPages.values()].sort(sortByValueThenCount)
        : [],
    }))
    .sort(sortByValueThenCount);

  return {
    range: request.range,
    summary: finalizeMetrics(summary),
    series: buildSeries(seriesRows, request),
    sources,
  };
}
