# Overview Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new analytics-focused Overview page (`/overview`) with KPI cards, charts, and panels showing order volume, revenue, courier performance, social inbox activity, and customer retention.

**Architecture:** A new `GET /api/overview` endpoint aggregates all data in one call. The frontend is a new `Overview.tsx` page with reusable chart/panel components using Recharts. The existing Dashboard (`/`) remains unchanged.

**Tech Stack:** React 18, TypeScript, Recharts 2.15.4 (already installed), Express.js, Supabase, Framer Motion, Phosphor Icons, shadcn/ui

## Global Constraints

- Always use `apiFetch()` from `src/lib/api.ts` for frontend API calls
- Always scope DB queries by `org_id` — every query on user-data tables must filter by resolved `org_id`
- Always guard new API endpoints with auth: `getToken(req)` → `getUser(token)` → 401 if no user
- Use Phosphor Icons with `weight="light"` for all new icons
- Use `bg-[#FAFAF8]` background, borderless panels, `rounded-lg` sparingly
- Currency: use `৳` (taka symbol) for BDT amounts
- Font: Geist Sans (already loaded globally)
- Icons: Phosphor Icons (`@phosphor-icons/react`, `weight="light"`)
- Animations: Framer Motion for entrance animations
- Labels: `text-[8px] font-medium tracking-[0.3em] text-black uppercase`
- Values: `text-2xl font-light`
- Never commit `.env` or secrets
- Run `normalizeBdPhone()` before passing phone numbers to any external API

---

### Task 1: Backend Overview Module

**Files:**
- Create: `server/overview.js`
- Test: `src/test/overview.test.ts`

**Interfaces:**
- Consumes: `computeOrderCogs` from `./cog.js`, `normalizeCustomerPhone` from `./customers.js`
- Produces: `buildOverviewData(orders, products, socialConversations, socialMessages, { since, until, prevSince, prevUntil })` → overview data object (socialMessages reserved for future avg response time calculation)

**Purpose:** Pure functions that transform raw DB data into the overview response shape. Keeps aggregation logic testable without hitting the database.

- [ ] **Step 1: Write the failing test**

Create `src/test/overview.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildOverviewData } from "../../server/overview.js";

describe("buildOverviewData", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  const orders = [
    { id: "1", created_at: "2026-08-12T10:00:00.000Z", price: "1000", delivery_rate: "60", product: "1 x Shirt", courier_status: "delivered", courier_name: "steadfast", phone: "01711111111", customer_name: "A" },
    { id: "2", created_at: "2026-08-12T14:00:00.000Z", price: "2000", delivery_rate: "60", product: "1 x Pants", courier_status: "pending", courier_name: "pathao", phone: "01722222222", customer_name: "B" },
    { id: "3", created_at: "2026-08-11T09:00:00.000Z", price: "500", delivery_rate: "60", product: "1 x Shirt", courier_status: "delivered", courier_name: "steadfast", phone: "01711111111", customer_name: "A" },
    { id: "4", created_at: "2026-08-10T11:00:00.000Z", price: "1500", delivery_rate: "60", product: "1 x Shoes", courier_status: "returned", courier_name: "pathao", phone: "01733333333", customer_name: "C" },
  ];

  const products = [
    { id: "p1", name: "Shirt", cog: "300", selling_price: "1000" },
    { id: "p2", name: "Pants", cog: "800", selling_price: "2000" },
    { id: "p3", name: "Shoes", cog: "600", selling_price: "1500" },
  ];

  const socialConversations = [
    { id: "c1", platform: "facebook", unread_count: 3, created_at: "2026-08-12T10:00:00.000Z" },
    { id: "c2", platform: "instagram", unread_count: 0, created_at: "2026-08-12T11:00:00.000Z" },
    { id: "c3", platform: "whatsapp", unread_count: 2, created_at: "2026-08-13T09:00:00.000Z" },
  ];

  it("computes KPIs correctly for a 2-day range", () => {
    const result = buildOverviewData(orders, products, socialConversations, [], {
      since: "2026-08-12",
      until: "2026-08-13",
      prevSince: "2026-08-10",
      prevUntil: "2026-08-11",
      now,
    });

    expect(result.kpis.totalOrders.value).toBe(2);
    expect(result.kpis.totalOrders.previousValue).toBe(2);
    expect(result.kpis.revenue.value).toBe(3120); // (1000+60) + (2000+60)
    expect(result.kpis.unreadMessages.value).toBe(5); // 3 + 0 + 2
  });

  it("computes courier performance grouped by courier name", () => {
    const result = buildOverviewData(orders, products, socialConversations, [], {
      since: "2026-08-10",
      until: "2026-08-13",
      prevSince: "2026-08-06",
      prevUntil: "2026-08-09",
      now,
    });

    expect(result.courierPerformance.steadfast.delivered).toBe(2);
    expect(result.courierPerformance.pathao.delivered).toBe(0);
    expect(result.courierPerformance.pathao.failed).toBe(1);
  });

  it("computes customer retention from repeat phone numbers", () => {
    const result = buildOverviewData(orders, products, socialConversations, [], {
      since: "2026-08-10",
      until: "2026-08-13",
      prevSince: "2026-08-06",
      prevUntil: "2026-08-09",
      now,
    });

    expect(result.customerRetention.totalCustomers).toBe(3);
    expect(result.customerRetention.repeatCustomers).toBe(1); // 01711111111 has 2 orders
    expect(result.customerRetention.repeatRate).toBeCloseTo(33.33, 1);
  });

  it("generates order volume series with current and previous period", () => {
    const result = buildOverviewData(orders, products, socialConversations, [], {
      since: "2026-08-12",
      until: "2026-08-13",
      prevSince: "2026-08-10",
      prevUntil: "2026-08-11",
      now,
    });

    expect(result.orderVolumeSeries.length).toBe(2);
    expect(result.orderVolumeSeries[0].date).toBe("2026-08-12");
    expect(result.orderVolumeSeries[0].current).toBe(2);
    expect(result.orderVolumeSeries[0].previous).toBe(1);
  });

  it("generates revenue series with cog, shipping, profit breakdown", () => {
    const result = buildOverviewData(orders, products, socialConversations, [], {
      since: "2026-08-12",
      until: "2026-08-13",
      prevSince: "2026-08-10",
      prevUntil: "2026-08-11",
      now,
    });

    const day1 = result.revenueSeries.find((d) => d.date === "2026-08-12");
    expect(day1).toBeDefined();
    expect(day1.revenue).toBe(3120);
    expect(day1.shipping).toBe(120);
    expect(day1.cog).toBe(1100); // 300 + 800
    expect(day1.profit).toBe(3120 - 1100 - 120);
  });

  it("computes social inbox stats by channel", () => {
    const result = buildOverviewData(orders, products, socialConversations, [], {
      since: "2026-08-12",
      until: "2026-08-13",
      prevSince: "2026-08-10",
      prevUntil: "2026-08-11",
      now,
    });

    expect(result.socialInbox.unread).toBe(5);
    expect(result.socialInbox.byChannel.facebook).toBe(1);
    expect(result.socialInbox.byChannel.whatsapp).toBe(1);
  });

  it("returns empty series when no orders match", () => {
    const result = buildOverviewData([], products, socialConversations, [], {
      since: "2026-08-12",
      until: "2026-08-13",
      prevSince: "2026-08-10",
      prevUntil: "2026-08-11",
      now,
    });

    expect(result.kpis.totalOrders.value).toBe(0);
    expect(result.orderVolumeSeries.every((d) => d.current === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/overview.test.ts -v`
Expected: FAIL with "Cannot find module '../../server/overview.js'"

- [ ] **Step 3: Write the implementation**

Create `server/overview.js`:

```javascript
import { computeOrderCogs } from "./cog.js";
import { normalizeCustomerPhone } from "./customers.js";

function toDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

function classifyCourierStatus(status) {
  const s = (status || "").toLowerCase();
  if (s === "delivered" || s === "partial_delivered") return "delivered";
  if (s === "returned" || s === "cancelled" || s === "rejected") return "failed";
  if (s === "pending" || s === "processing") return "pending";
  return "in_transit";
}

function customerKey(order) {
  const phone = normalizeCustomerPhone(order.phone);
  const name = String(order.customer_name || "").trim().toLowerCase();
  if (phone) return `phone:${phone}`;
  if (name) return `name:${name}`;
  return "";
}

export function buildOverviewData(orders, products, socialConversations, socialMessages, { since, until, prevSince, prevUntil, now = new Date() }) {
  const dayCount = daysBetween(since, until);
  const prevDayCount = prevSince && prevUntil ? daysBetween(prevSince, prevUntil) : dayCount;

  // ─ KPIs ──
  const currentOrders = (orders || []).filter((o) => {
    const day = toDayKey(o.created_at);
    return day >= since && day <= until;
  });
  const prevOrders = (orders || []).filter((o) => {
    const day = toDayKey(o.created_at);
    return day >= prevSince && day <= prevUntil;
  });

  const currentCogResult = computeOrderCogs(currentOrders, products || []);
  const prevCogResult = computeOrderCogs(prevOrders, products || []);

  const sumRevenue = (os) => os.reduce((s, o) => s + (parseFloat(o.price || 0) + parseFloat(o.delivery_rate || 0)), 0);
  const sumShipping = (os) => os.reduce((s, o) => s + parseFloat(o.delivery_rate || 0), 0);

  const currentRevenue = sumRevenue(currentOrders);
  const prevRevenue = sumRevenue(prevOrders);
  const currentProfit = currentRevenue - currentCogResult.totalCog - sumShipping(currentOrders);
  const prevProfit = prevRevenue - prevCogResult.totalCog - sumShipping(prevOrders);

  const profitMargin = currentRevenue > 0 ? (currentProfit / currentRevenue) * 100 : 0;
  const prevProfitMargin = prevRevenue > 0 ? (prevProfit / prevRevenue) * 100 : 0;

  const courierStatusCounts = (os) => {
    const counts = { delivered: 0, failed: 0, in_transit: 0, pending: 0 };
    for (const o of os) {
      const cls = classifyCourierStatus(o.courier_status);
      counts[cls] = (counts[cls] || 0) + 1;
    }
    return counts;
  };
  const currentCourier = courierStatusCounts(currentOrders);
  const prevCourier = courierStatusCounts(prevOrders);
  const currentDelivered = currentCourier.delivered;
  const currentFailed = currentCourier.failed;
  const deliverySuccess = currentDelivered + currentFailed > 0 ? (currentDelivered / (currentDelivered + currentFailed)) * 100 : 0;
  const prevDelivered = prevCourier.delivered;
  const prevFailed = prevCourier.failed;
  const prevDeliverySuccess = prevDelivered + prevFailed > 0 ? (prevDelivered / (prevDelivered + prevFailed)) * 100 : 0;

  const totalUnread = (socialConversations || []).reduce((s, c) => s + (c.unread_count || 0), 0);
  const todayKey = toDayKey(now);
  const yesterdayKey = addDaysYmd(todayKey, -1);
  const yesterdayConvs = (socialConversations || []).filter((c) => toDayKey(c.created_at) === yesterdayKey);
  const yesterdayUnread = yesterdayConvs.reduce((s, c) => s + (c.unread_count || 0), 0);

  const trend = (cur, prev) => {
    if (prev === 0) return cur > 0 ? 100 : 0;
    return ((cur - prev) / prev) * 100;
  };

  const kpis = {
    totalOrders: { value: currentOrders.length, trend: trend(currentOrders.length, prevOrders.length), previousValue: prevOrders.length },
    revenue: { value: Math.round(currentRevenue), trend: trend(currentRevenue, prevRevenue), previousValue: Math.round(prevRevenue) },
    profitMargin: { value: Math.round(profitMargin * 10) / 10, trend: trend(profitMargin, prevProfitMargin), previousValue: Math.round(prevProfitMargin * 10) / 10 },
    deliverySuccess: { value: Math.round(deliverySuccess * 10) / 10, trend: trend(deliverySuccess, prevDeliverySuccess), previousValue: Math.round(prevDeliverySuccess * 10) / 10 },
    unreadMessages: { value: totalUnread, trend: yesterdayUnread > 0 ? trend(totalUnread, yesterdayUnread) : 0, previousValue: yesterdayUnread },
  };

  // ── Order Volume Series ──
  const orderVolumeSeries = [];
  for (let i = 0; i < dayCount; i++) {
    const day = addDaysYmd(since, i);
    const prevDay = addDaysYmd(prevSince, i);
    const current = currentOrders.filter((o) => toDayKey(o.created_at) === day).length;
    const previous = prevOrders.filter((o) => toDayKey(o.created_at) === prevDay).length;
    orderVolumeSeries.push({ date: day, current, previous });
  }

  // ── Revenue Series ──
  const revenueSeries = [];
  for (let i = 0; i < dayCount; i++) {
    const day = addDaysYmd(since, i);
    const dayOrders = currentOrders.filter((o) => toDayKey(o.created_at) === day);
    const dayCog = computeOrderCogs(dayOrders, products || []);
    const revenue = sumRevenue(dayOrders);
    const shipping = sumShipping(dayOrders);
    const cog = dayCog.totalCog;
    const profit = revenue - cog - shipping;
    revenueSeries.push({ date: day, revenue: Math.round(revenue), cog: Math.round(cog), shipping: Math.round(shipping), profit: Math.round(profit) });
  }

  // ── Courier Performance ──
  const courierPerformance = {};
  const courierNames = new Set(currentOrders.map((o) => o.courier_name).filter(Boolean));
  for (const name of courierNames) {
    const courierOrders = currentOrders.filter((o) => o.courier_name === name);
    const counts = courierStatusCounts(courierOrders);
    courierPerformance[name.toLowerCase()] = counts;
  }

  // ── Social Inbox ──
  const byChannel = {};
  for (const conv of socialConversations || []) {
    const p = conv.platform || "unknown";
    byChannel[p] = (byChannel[p] || 0) + 1;
  }
  const todayConvs = (socialConversations || []).filter((c) => toDayKey(c.created_at) === todayKey);
  const socialInbox = {
    unread: totalUnread,
    avgResponseTimeMinutes: 0,
    conversationsToday: todayConvs.length,
    byChannel,
  };

  // ── Customer Retention ──
  const customerOrders = new Map();
  for (const o of currentOrders) {
    const key = customerKey(o);
    if (!key) continue;
    const existing = customerOrders.get(key) || { name: o.customer_name || "", phone: o.phone || "", count: 0, spent: 0 };
    existing.count += 1;
    existing.spent += parseFloat(o.price || 0) + parseFloat(o.delivery_rate || 0);
    customerOrders.set(key, existing);
  }
  const totalCustomers = customerOrders.size;
  const repeatCustomers = Array.from(customerOrders.values()).filter((c) => c.count >= 2).length;
  const repeatRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;
  const topCustomers = Array.from(customerOrders.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((c) => ({ name: c.name, phone: c.phone, orderCount: c.count, totalSpent: Math.round(c.spent) }));

  const customerRetention = {
    repeatRate: Math.round(repeatRate * 10) / 10,
    repeatCustomers,
    totalCustomers,
    topCustomers,
  };

  return { kpis, orderVolumeSeries, revenueSeries, courierPerformance, socialInbox, customerRetention };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/overview.test.ts -v`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/overview.js src/test/overview.test.ts
git commit -m "feat: add overview data aggregation module with tests"
```

---

### Task 2: Backend Overview API Endpoint

**Files:**
- Modify: `server/index.js` (add route near analytics routes, around line 2903)

**Interfaces:**
- Consumes: `buildOverviewData` from `./overview.js`, `getUser`, `getUserOrg`, `getOrgSettings`, `computeOrderCogs`
- Produces: `GET /api/overview?since=YYYY-MM-DD&until=YYYY-MM-DD` → JSON response

- [ ] **Step 1: Add the import at the top of server/index.js**

Add near the existing imports (around line 14):

```javascript
import { buildOverviewData } from "./overview.js";
```

- [ ] **Step 2: Add the route handler**

Add after the analytics route section (around line 2903, before the `// ─── Analytics ──` comment):

```javascript
// ─── Overview ────────────────────────────────────────────────────────────────

app.get("/api/overview", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const since = req.query.since || null;
    const until = req.query.until || null;

    // Default to last 7 days if no range specified
    const todayDhaka = () => {
      const dhakaMs = Date.now() + 6 * 60 * 60 * 1000;
      const d = new Date(dhakaMs);
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    };
    const today = todayDhaka();
    const defaultUntil = today.toISOString().slice(0, 10);
    const defaultSince = new Date(today.getTime() - 6 * 86400000).toISOString().slice(0, 10);

    const rangeSince = since || defaultSince;
    const rangeUntil = until || defaultUntil;

    // Compute previous period (same length, immediately before)
    const rangeDays = Math.round((new Date(`${rangeUntil}T00:00:00Z`) - new Date(`${rangeSince}T00:00:00Z`)) / 86400000) + 1;
    const prevUntil = new Date(new Date(`${rangeSince}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
    const prevSince = new Date(new Date(`${prevUntil}T00:00:00Z`).getTime() - (rangeDays - 1) * 86400000).toISOString().slice(0, 10);

    // Fetch orders for both periods in one query
    const { data: allOrders, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .eq("org_id", orgId)
      .gte("created_at", `${prevSince}T00:00:00+06:00`)
      .lte("created_at", `${rangeUntil}T23:59:59+06:00`);
    if (ordersError) throw ordersError;

    // Fetch products for COG lookup
    const { data: products } = await supabase
      .from("products")
      .select("id, name, selling_price, cog")
      .eq("org_id", orgId);

    // Fetch social conversations
    const { data: socialConversations } = await supabase
      .from("social_conversations")
      .select("id, platform, unread_count, created_at")
      .eq("org_id", orgId);

    // Fetch social messages for conversations in this org (reserved for avg response time)
    const convIds = (socialConversations || []).map((c) => c.id);
    let socialMessages = [];
    if (convIds.length > 0) {
      const { data: msgs } = await supabase
        .from("social_messages")
        .select("id, conversation_id, sender, created_at")
        .in("conversation_id", convIds);
      socialMessages = msgs || [];
    }

    const overview = buildOverviewData(
      allOrders || [],
      products || [],
      socialConversations || [],
      socialMessages,
      { since: rangeSince, until: rangeUntil, prevSince, prevUntil }
    );

    console.log(`[Overview] range: ${rangeSince} to ${rangeUntil}, prev: ${prevSince} to ${prevUntil}, orders: ${(allOrders || []).length}`);

    res.json(overview);
  } catch (err) {
    console.error("[Overview] Error:", err.message);
    res.status(500).json({ error: "Failed to load overview data" });
  }
});
```

- [ ] **Step 3: Verify the server starts without errors**

Run: `node --check server/index.js`
Expected: No output (syntax OK)

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: add /api/overview endpoint with auth and org_id isolation"
```

---

### Task 3: KPI Card Component

**Files:**
- Create: `src/components/overview/KpiCard.tsx`
- Test: `src/test/overviewKpiCard.test.tsx`

**Interfaces:**
- Consumes: Framer Motion, Phosphor Icons
- Produces: `<KpiCard label, value, trend, previousValue, sparklineValues, icon } />`

- [ ] **Step 1: Write the failing test**

Create `src/test/overviewKpiCard.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiCard } from "../../src/components/overview/KpiCard";

describe("KpiCard", () => {
  it("renders label, value, and trend", () => {
    render(
      <KpiCard
        label="Total Orders"
        value="245"
        trend={12.4}
        previousValue={218}
        sparklineValues={[10, 20, 15, 30, 25, 35, 28]}
        icon="Package"
      />
    );
    expect(screen.getByText("Total Orders")).toBeInTheDocument();
    expect(screen.getByText("245")).toBeInTheDocument();
    expect(screen.getByText("+12.4%")).toBeInTheDocument();
  });

  it("shows negative trend in red", () => {
    render(
      <KpiCard
        label="Profit Margin"
        value="23.5%"
        trend={-2.1}
        previousValue={25.6}
        sparklineValues={[30, 28, 25, 27, 24, 23, 23.5]}
        icon="TrendDown"
      />
    );
    const trendEl = screen.getByText("-2.1%");
    expect(trendEl).toBeInTheDocument();
    expect(trendEl.className).toContain("text-red-500");
  });

  it("renders sparkline bars", () => {
    const { container } = render(
      <KpiCard
        label="Revenue"
        value="৳184,320"
        trend={8.2}
        previousValue={170280}
        sparklineValues={[100, 200, 150, 300, 250, 350, 280]}
        icon="CurrencyCircleDollar"
      />
    );
    const bars = container.querySelectorAll("[data-sparkline-bar]");
    expect(bars.length).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/overviewKpiCard.test.tsx -v`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

Create `src/components/overview/KpiCard.tsx`:

```tsx
import { motion } from "framer-motion";
import {
  Package,
  CurrencyCircleDollar,
  Percent,
  Truck,
  Chats,
  TrendUp,
  TrendDown,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ElementType> = {
  Package,
  CurrencyCircleDollar,
  Percent,
  Truck,
  Chats,
};

function MiniSparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[3px]" style={{ height: "24px" }}>
      {values.map((v, i) => {
        const isActive = i === values.length - 1;
        const height = Math.max(4, (v / max) * 100);
        return (
          <div
            key={i}
            data-sparkline-bar
            className="rounded-full"
            style={{
              width: isActive ? "4px" : "3px",
              height: `${height}%`,
              backgroundColor: isActive ? "#232323" : "#BFBFBC",
              opacity: isActive ? 1 : 0.4,
            }}
          />
        );
      })}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  trend,
  previousValue,
  sparklineValues,
  icon,
}: {
  label: string;
  value: string;
  trend: number;
  previousValue: number;
  sparklineValues: number[];
  icon: string;
}) {
  const IconComponent = iconMap[icon] || Package;
  const isPositive = trend >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-black/[0.06] bg-white p-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-[8px] font-medium tracking-[0.3em] text-black/40 uppercase">{label}</p>
        <IconComponent weight="light" size={16} className="text-black/30" />
      </div>

      <div className="mt-2 flex items-end justify-between">
        <p className="text-2xl font-light text-black tabular-nums">{value}</p>
        <MiniSparkline values={sparklineValues} />
      </div>

      <div className="mt-2 flex items-center gap-1">
        {isPositive ? (
          <TrendUp weight="light" size={12} className="text-emerald-600" />
        ) : (
          <TrendDown weight="light" size={12} className="text-red-500" />
        )}
        <span
          className={cn(
            "text-[10px] font-medium tabular-nums",
            isPositive ? "text-emerald-600" : "text-red-500"
          )}
        >
          {isPositive ? "+" : ""}
          {trend.toFixed(1)}%
        </span>
        <span className="text-[10px] text-black/30">vs prev</span>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/overviewKpiCard.test.tsx -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/overview/KpiCard.tsx src/test/overviewKpiCard.test.tsx
git commit -m "feat: add KpiCard component with sparkline and trend indicator"
```

---

### Task 4: Chart Components

**Files:**
- Create: `src/components/overview/OrderVolumeChart.tsx`
- Create: `src/components/overview/RevenueChart.tsx`
- Test: `src/test/overviewCharts.test.tsx`

**Interfaces:**
- Consumes: Recharts (`AreaChart`, `Area`, `BarChart`, `Bar`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`, `CartesianGrid`)
- Produces: `<OrderVolumeChart data />`, `<RevenueChart data />`

- [ ] **Step 1: Write the failing tests**

Create `src/test/overviewCharts.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderVolumeChart } from "../../src/components/overview/OrderVolumeChart";
import { RevenueChart } from "../../src/components/overview/RevenueChart";

describe("OrderVolumeChart", () => {
  const data = [
    { date: "Aug 7", current: 32, previous: 28 },
    { date: "Aug 8", current: 45, previous: 30 },
    { date: "Aug 9", current: 38, previous: 35 },
  ];

  it("renders the chart title", () => {
    render(<OrderVolumeChart data={data} />);
    expect(screen.getByText("Order Volume")).toBeInTheDocument();
  });

  it("renders all date labels on x-axis", () => {
    render(<OrderVolumeChart data={data} />);
    expect(screen.getByText("Aug 7")).toBeInTheDocument();
    expect(screen.getByText("Aug 9")).toBeInTheDocument();
  });
});

describe("RevenueChart", () => {
  const data = [
    { date: "Aug 7", revenue: 12400, cog: 7200, shipping: 1800, profit: 3400 },
    { date: "Aug 8", revenue: 15600, cog: 8100, shipping: 2200, profit: 5300 },
  ];

  it("renders the chart title", () => {
    render(<RevenueChart data={data} />);
    expect(screen.getByText("Revenue vs Costs")).toBeInTheDocument();
  });

  it("renders legend items", () => {
    render(<RevenueChart data={data} />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("Profit")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/overviewCharts.test.tsx -v`
Expected: FAIL

- [ ] **Step 3: Write OrderVolumeChart**

Create `src/components/overview/OrderVolumeChart.tsx`:

```tsx
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";

interface OrderVolumeData {
  date: string;
  current: number;
  previous: number;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const current = payload.find((p) => p.dataKey === "current");
  const previous = payload.find((p) => p.dataKey === "previous");
  const change = current && previous && previous.value > 0
    ? (((current.value - previous.value) / previous.value) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 shadow-lg">
      <p className="text-[10px] font-medium text-black/50 mb-1">{label}</p>
      <p className="text-[12px] font-semibold text-black">This period: {current?.value ?? 0}</p>
      <p className="text-[11px] text-black/50">Previous: {previous?.value ?? 0}</p>
      <p className={`text-[11px] font-medium ${Number(change) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
        {Number(change) >= 0 ? "+" : ""}{change}% vs previous
      </p>
    </div>
  );
}

export function OrderVolumeChart({ data }: { data: OrderVolumeData[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="rounded-xl border border-black/[0.06] bg-white p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[8px] font-medium tracking-[0.3em] text-black/40 uppercase">Orders</p>
          <p className="text-[15px] font-semibold text-black mt-0.5">Order Volume</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-[#232323]" />
            <span className="text-[10px] text-black/50">This period</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-black/15" />
            <span className="text-[10px] text-black/50">Previous</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "rgba(0,0,0,0.35)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "rgba(0,0,0,0.35)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="previous"
            stroke="rgba(0,0,0,0.15)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            fill="rgba(0,0,0,0.02)"
          />
          <Area
            type="monotone"
            dataKey="current"
            stroke="#232323"
            strokeWidth={2}
            fill="rgba(35,35,35,0.08)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
```

- [ ] **Step 4: Write RevenueChart**

Create `src/components/overview/RevenueChart.tsx`:

```tsx
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { motion } from "framer-motion";

interface RevenueData {
  date: string;
  revenue: number;
  cog: number;
  shipping: number;
  profit: number;
}

function fmtBDT(n: number) {
  return "৳" + n.toLocaleString("en-BD", { maximumFractionDigits: 0 });
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 shadow-lg">
      <p className="text-[10px] font-medium text-black/50 mb-1.5">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 text-[11px]">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-black/60 capitalize">{entry.dataKey}</span>
          </div>
          <span className="font-medium text-black tabular-nums">{fmtBDT(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function RevenueChart({ data }: { data: RevenueData[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className="rounded-xl border border-black/[0.06] bg-white p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[8px] font-medium tracking-[0.3em] text-black/40 uppercase">Financials</p>
          <p className="text-[15px] font-semibold text-black mt-0.5">Revenue vs Costs</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "rgba(0,0,0,0.35)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "rgba(0,0,0,0.35)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `৳${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={6}
            wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }}
          />
          <Bar dataKey="cog" stackId="costs" fill="#D97706" radius={[0, 0, 0, 0]} name="COG" />
          <Bar dataKey="shipping" stackId="costs" fill="#3B82F6" radius={[0, 0, 0, 0]} name="Shipping" />
          <Bar dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} name="Revenue" />
          <Line
            type="monotone"
            dataKey="profit"
            stroke="#232323"
            strokeWidth={2}
            dot={false}
            name="Profit"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/test/overviewCharts.test.tsx -v`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/overview/OrderVolumeChart.tsx src/components/overview/RevenueChart.tsx src/test/overviewCharts.test.tsx
git commit -m "feat: add OrderVolumeChart and RevenueChart components with Recharts"
```

---

### Task 5: Bottom Panel Components

**Files:**
- Create: `src/components/overview/CourierPanel.tsx`
- Create: `src/components/overview/SocialInboxPanel.tsx`
- Create: `src/components/overview/RetentionPanel.tsx`
- Test: `src/test/overviewPanels.test.tsx`

**Interfaces:**
- Consumes: Recharts (`BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`), Phosphor Icons
- Produces: `<CourierPanel data />`, `<SocialInboxPanel data />`, `<RetentionPanel data />`

- [ ] **Step 1: Write the failing tests**

Create `src/test/overviewPanels.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CourierPanel } from "../../src/components/overview/CourierPanel";
import { SocialInboxPanel } from "../../src/components/overview/SocialInboxPanel";
import { RetentionPanel } from "../../src/components/overview/RetentionPanel";

describe("CourierPanel", () => {
  const data = {
    steadfast: { delivered: 180, in_transit: 20, failed: 12, pending: 8 },
    pathao: { delivered: 95, in_transit: 8, failed: 5, pending: 3 },
  };

  it("renders courier names", () => {
    render(<CourierPanel data={data} />);
    expect(screen.getByText("Steadfast")).toBeInTheDocument();
    expect(screen.getByText("Pathao")).toBeInTheDocument();
  });

  it("shows overall delivery success rate", () => {
    render(<CourierPanel data={data} />);
    expect(screen.getByText(/87\.3%/)).toBeInTheDocument();
  });
});

describe("SocialInboxPanel", () => {
  const data = {
    unread: 12,
    avgResponseTimeMinutes: 45,
    conversationsToday: 28,
    byChannel: { facebook: 18, instagram: 7, whatsapp: 3 },
  };

  it("renders unread count", () => {
    render(<SocialInboxPanel data={data} />);
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders channel breakdown", () => {
    render(<SocialInboxPanel data={data} />);
    expect(screen.getByText("Facebook")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
  });
});

describe("RetentionPanel", () => {
  const data = {
    repeatRate: 34.2,
    repeatCustomers: 84,
    totalCustomers: 245,
    topCustomers: [
      { name: "Ayesha", phone: "01711111111", orderCount: 12, totalSpent: 45200 },
    ],
  };

  it("renders repeat rate", () => {
    render(<RetentionPanel data={data} />);
    expect(screen.getByText("34.2%")).toBeInTheDocument();
  });

  it("renders top customer", () => {
    render(<RetentionPanel data={data} />);
    expect(screen.getByText("Ayesha")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/overviewPanels.test.tsx -v`
Expected: FAIL

- [ ] **Step 3: Write CourierPanel**

Create `src/components/overview/CourierPanel.tsx`:

```tsx
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Truck } from "@phosphor-icons/react";

interface CourierData {
  [key: string]: { delivered: number; in_transit: number; failed: number; pending: number };
}

export function CourierPanel({ data }: { data: CourierData }) {
  const couriers = Object.entries(data).map(([name, stats]) => {
    const total = stats.delivered + stats.in_transit + stats.failed + stats.pending;
    const successRate = stats.delivered + stats.failed > 0
      ? (stats.delivered / (stats.delivered + stats.failed)) * 100
      : 0;
    return { name: name.charAt(0).toUpperCase() + name.slice(1), ...stats, total, successRate: Math.round(successRate * 10) / 10 };
  });

  const totalDelivered = couriers.reduce((s, c) => s + c.delivered, 0);
  const totalFailed = couriers.reduce((s, c) => s + c.failed, 0);
  const overallSuccess = totalDelivered + totalFailed > 0
    ? (totalDelivered / (totalDelivered + totalFailed)) * 100
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="rounded-xl border border-black/[0.06] bg-white p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[8px] font-medium tracking-[0.3em] text-black/40 uppercase">Delivery</p>
          <p className="text-[15px] font-semibold text-black mt-0.5">Courier Performance</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-black/40">Success Rate</p>
          <p className="text-[18px] font-semibold text-black tabular-nums">{overallSuccess.toFixed(1)}%</p>
        </div>
      </div>

      <div className="space-y-3">
        {couriers.map((c) => (
          <div key={c.name} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-black">{c.name}</span>
              <span className="text-[11px] text-black/50 tabular-nums">{c.successRate}%</span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-black/[0.04]">
              {c.delivered > 0 && (
                <div className="bg-emerald-500 transition-all" style={{ width: `${(c.delivered / c.total) * 100}%` }} />
              )}
              {c.in_transit > 0 && (
                <div className="bg-blue-400 transition-all" style={{ width: `${(c.in_transit / c.total) * 100}%` }} />
              )}
              {c.pending > 0 && (
                <div className="bg-amber-400 transition-all" style={{ width: `${(c.pending / c.total) * 100}%` }} />
              )}
              {c.failed > 0 && (
                <div className="bg-red-400 transition-all" style={{ width: `${(c.failed / c.total) * 100}%` }} />
              )}
            </div>
            <div className="flex gap-3 text-[9px] text-black/40">
              <span>{c.delivered} delivered</span>
              <span>{c.in_transit} in transit</span>
              <span>{c.failed} failed</span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 4: Write SocialInboxPanel**

Create `src/components/overview/SocialInboxPanel.tsx`:

```tsx
import { motion } from "framer-motion";
import { Chats, Clock, Hash } from "@phosphor-icons/react";

interface SocialInboxData {
  unread: number;
  avgResponseTimeMinutes: number;
  conversationsToday: number;
  byChannel: Record<string, number>;
}

const channelIcons: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
};

export function SocialInboxPanel({ data }: { data: SocialInboxData }) {
  const maxChannel = Math.max(...Object.values(data.byChannel), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.25 }}
      className="rounded-xl border border-black/[0.06] bg-white p-5"
    >
      <div className="mb-4">
        <p className="text-[8px] font-medium tracking-[0.3em] text-black/40 uppercase">Social</p>
        <p className="text-[15px] font-semibold text-black mt-0.5">Inbox Activity</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <Chats weight="light" size={18} className="mx-auto text-black/30 mb-1" />
          <p className="text-[16px] font-semibold text-black tabular-nums">{data.unread}</p>
          <p className="text-[9px] text-black/40">Unread</p>
        </div>
        <div className="text-center">
          <Clock weight="light" size={18} className="mx-auto text-black/30 mb-1" />
          <p className="text-[16px] font-semibold text-black tabular-nums">{data.avgResponseTimeMinutes}m</p>
          <p className="text-[9px] text-black/40">Avg Response</p>
        </div>
        <div className="text-center">
          <Hash weight="light" size={18} className="mx-auto text-black/30 mb-1" />
          <p className="text-[16px] font-semibold text-black tabular-nums">{data.conversationsToday}</p>
          <p className="text-[9px] text-black/40">Today</p>
        </div>
      </div>

      <div className="space-y-2">
        {Object.entries(data.byChannel).map(([channel, count]) => (
          <div key={channel} className="flex items-center gap-2">
            <span className="text-[10px] text-black/50 w-16">{channelIcons[channel] || channel}</span>
            <div className="flex-1 h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#232323] rounded-full transition-all"
                style={{ width: `${(count / maxChannel) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-black tabular-nums w-6 text-right">{count}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 5: Write RetentionPanel**

Create `src/components/overview/RetentionPanel.tsx`:

```tsx
import { motion } from "framer-motion";
import { Users, Crown } from "@phosphor-icons/react";

interface RetentionData {
  repeatRate: number;
  repeatCustomers: number;
  totalCustomers: number;
  topCustomers: Array<{ name: string; phone: string; orderCount: number; totalSpent: number }>;
}

function fmtBDT(n: number) {
  return "৳" + n.toLocaleString("en-BD", { maximumFractionDigits: 0 });
}

export function RetentionPanel({ data }: { data: RetentionData }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.3 }}
      className="rounded-xl border border-black/[0.06] bg-white p-5"
    >
      <div className="mb-4">
        <p className="text-[8px] font-medium tracking-[0.3em] text-black/40 uppercase">Customers</p>
        <p className="text-[15px] font-semibold text-black mt-0.5">Retention</p>
      </div>

      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <p className="text-[28px] font-light text-black tabular-nums">{data.repeatRate}%</p>
          <p className="text-[11px] text-black/40">repeat rate</p>
        </div>
        <p className="text-[11px] text-black/50 mt-1">
          {data.repeatCustomers} of {data.totalCustomers} customers are repeat buyers
        </p>
        <div className="mt-2 h-2 w-full bg-black/[0.04] rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${data.repeatRate}%` }}
          />
        </div>
      </div>

      {data.topCustomers.length > 0 && (
        <div>
          <p className="text-[9px] font-medium tracking-[0.2em] text-black/30 uppercase mb-2">Top Customers</p>
          <div className="space-y-1.5">
            {data.topCustomers.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5">
                  {i === 0 && <Crown weight="light" size={12} className="text-amber-500" />}
                  <span className="text-black/70">{c.name || c.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-black/40">{c.orderCount} orders</span>
                  <span className="font-medium text-black tabular-nums">{fmtBDT(c.totalSpent)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/test/overviewPanels.test.tsx -v`
Expected: All 6 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/overview/CourierPanel.tsx src/components/overview/SocialInboxPanel.tsx src/components/overview/RetentionPanel.tsx src/test/overviewPanels.test.tsx
git commit -m "feat: add CourierPanel, SocialInboxPanel, and RetentionPanel components"
```

---

### Task 6: Overview Page & Routing

**Files:**
- Create: `src/pages/Overview.tsx`
- Modify: `src/App.tsx` (add route)
- Modify: `src/components/AppSidebar.tsx` (add nav item)
- Modify: `src/components/DashboardLayout.tsx` (add breadcrumb)

**Interfaces:**
- Consumes: All overview components, `apiFetch`, `DateRangePicker` from Dashboard
- Produces: `/overview` page

- [ ] **Step 1: Copy DateRangePicker to a shared location**

The `DateRangePicker` component is currently defined inside `Dashboard.tsx`. Extract it to a shared file so both pages can use it.

Create `src/components/DateRangePicker.tsx` by copying the component from `Dashboard.tsx` (lines 23-147) along with its dependencies (`toYMD`, `fmtRange`, `dhakaToday`, `TODAY`, `PRESETS`).

Then update `Dashboard.tsx` to import from the shared file:

```tsx
import { DateRangePicker } from "@/components/DateRangePicker";
```

Remove the inline `DateRangePicker` definition and its helper functions from `Dashboard.tsx`.

- [ ] **Step 2: Create the Overview page**

Create `src/pages/Overview.tsx`:

```tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { motion } from "framer-motion";
import { DateRangePicker } from "@/components/DateRangePicker";
import { KpiCard } from "@/components/overview/KpiCard";
import { OrderVolumeChart } from "@/components/overview/OrderVolumeChart";
import { RevenueChart } from "@/components/overview/RevenueChart";
import { CourierPanel } from "@/components/overview/CourierPanel";
import { SocialInboxPanel } from "@/components/overview/SocialInboxPanel";
import { RetentionPanel } from "@/components/overview/RetentionPanel";
import { Spinner } from "@/components/ui/ios-spinner";
import { format, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";

function dhakaToday(): Date {
  const dhakaMs = Date.now() + 6 * 60 * 60 * 1000;
  const d = new Date(dhakaMs);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const TODAY = dhakaToday();

interface OverviewData {
  kpis: {
    totalOrders: { value: number; trend: number; previousValue: number };
    revenue: { value: number; trend: number; previousValue: number };
    profitMargin: { value: number; trend: number; previousValue: number };
    deliverySuccess: { value: number; trend: number; previousValue: number };
    unreadMessages: { value: number; trend: number; previousValue: number };
  };
  orderVolumeSeries: Array<{ date: string; current: number; previous: number }>;
  revenueSeries: Array<{ date: string; revenue: number; cog: number; shipping: number; profit: number }>;
  courierPerformance: Record<string, { delivered: number; in_transit: number; failed: number; pending: number }>;
  socialInbox: {
    unread: number;
    avgResponseTimeMinutes: number;
    conversationsToday: number;
    byChannel: Record<string, number>;
  };
  customerRetention: {
    repeatRate: number;
    repeatCustomers: number;
    totalCustomers: number;
    topCustomers: Array<{ name: string; phone: string; orderCount: number; totalSpent: number }>;
  };
}

function fmtBDT(n: number) {
  return "৳" + n.toLocaleString("en-BD", { maximumFractionDigits: 0 });
}

export default function Overview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const todayRange = useMemo<DateRange>(() => ({ from: subDays(TODAY, 6), to: TODAY }), []);
  const [dateRange, setDateRange] = useState<DateRange | null>(todayRange);

  const fetchData = useCallback(async (range?: DateRange | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ t: String(Date.now()) });
      if (range?.from) params.set("since", format(range.from, "yyyy-MM-dd"));
      if (range?.to) params.set("until", format(range.to, "yyyy-MM-dd"));
      const res = await apiFetch(`/api/overview?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setData(json);
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData(dateRange);
  }, [dateRange, fetchData]);

  const handleDateRangeChange = useCallback((range: DateRange | null) => {
    setDateRange(range);
  }, []);

  if (loading || !data) {
    return (
      <div className="min-h-[calc(100vh-96px)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" className="text-foreground" />
          <span className="text-sm font-medium text-foreground/60">Loading Overview</span>
        </div>
      </div>
    );
  }

  const sparklineFromSeries = (series: Array<{ current?: number; revenue?: number }>, key: "current" | "revenue") =>
    series.slice(-7).map((d) => d[key] || 0);

  return (
    <div className="space-y-6 p-1 lg:p-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-black tracking-tight">Overview</h1>
        <div className="flex items-center gap-2">
          <DateRangePicker value={dateRange} onChange={handleDateRangeChange} />
          <button
            onClick={() => fetchData(dateRange)}
            disabled={loading}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-30"
            title="Refresh"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".5"/><path fill="currentColor" d="M7.378 11.63h-.75zm0 .926l-.562.497a.75.75 0 0 0 1.08.044zm2.141-1.015a.75.75 0 0 0-1.038-1.082zm-2.958-1.038a.75.75 0 1 0-1.122.994zm8.37-1.494a.75.75 0 1 0 1.102-1.018zM12.045 6.25c-2.986 0-5.416 2.403-5.416 5.38h1.5c0-2.137 1.747-3.88 3.916-3.88zm-5.416 5.38v.926h1.5v-.926zm1.269 1.467l1.622-1.556l-1.038-1.082l-1.622 1.555zm.042-1.039l-1.378-1.555l-1.122.994l1.377 1.556zm8.094-4.067a5.42 5.42 0 0 0-3.99-1.741v1.5a3.92 3.92 0 0 1 2.889 1.26zm.585 3.453l.56-.498a.75.75 0 0 0-1.08-.043zm-2.139 1.014a.75.75 0 1 0 1.04 1.082zm2.96 1.04a.75.75 0 0 0 1.12-.997zm-8.393 1.507a.75.75 0 0 0-1.094 1.026zm2.888 2.745c2.993 0 5.434-2.4 5.434-5.38h-1.5c0 2.135-1.753 3.88-3.934 3.88zm5.434-5.38v-.926h-1.5v.926zm-1.27-1.467l-1.619 1.555l1.04 1.082l1.618-1.555zm-.04 1.04l1.38 1.554l1.122-.996l-1.381-1.555zM7.952 16.03a5.45 5.45 0 0 0 3.982 1.719v-1.5c-1.143 0-2.17-.48-2.888-1.245z"/></svg>
          </button>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Total Orders"
          value={data.kpis.totalOrders.value.toLocaleString()}
          trend={data.kpis.totalOrders.trend}
          previousValue={data.kpis.totalOrders.previousValue}
          sparklineValues={sparklineFromSeries(data.orderVolumeSeries, "current")}
          icon="Package"
        />
        <KpiCard
          label="Revenue"
          value={fmtBDT(data.kpis.revenue.value)}
          trend={data.kpis.revenue.trend}
          previousValue={data.kpis.revenue.previousValue}
          sparklineValues={sparklineFromSeries(data.revenueSeries, "revenue")}
          icon="CurrencyCircleDollar"
        />
        <KpiCard
          label="Profit Margin"
          value={`${data.kpis.profitMargin.value}%`}
          trend={data.kpis.profitMargin.trend}
          previousValue={data.kpis.profitMargin.previousValue}
          sparklineValues={data.revenueSeries.slice(-7).map((d) => d.profit)}
          icon="Percent"
        />
        <KpiCard
          label="Delivery Success"
          value={`${data.kpis.deliverySuccess.value}%`}
          trend={data.kpis.deliverySuccess.trend}
          previousValue={data.kpis.deliverySuccess.previousValue}
          sparklineValues={[data.kpis.deliverySuccess.value]}
          icon="Truck"
        />
        <KpiCard
          label="Unread Messages"
          value={data.kpis.unreadMessages.value.toString()}
          trend={data.kpis.unreadMessages.trend}
          previousValue={data.kpis.unreadMessages.previousValue}
          sparklineValues={[data.kpis.unreadMessages.value]}
          icon="Chats"
        />
      </div>

      {/* Row 2: Large Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <OrderVolumeChart data={data.orderVolumeSeries.map((d) => ({ ...d, date: d.date.slice(5) }))} />
        <RevenueChart data={data.revenueSeries.map((d) => ({ ...d, date: d.date.slice(5) }))} />
      </div>

      {/* Row 3: Bottom Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <CourierPanel data={data.courierPerformance} />
        <SocialInboxPanel data={data.socialInbox} />
        <RetentionPanel data={data.customerRetention} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add route to App.tsx**

Add to `App.tsx` inside the `ProtectedRoute` > `DashboardLayout` routes block (after the Dashboard route):

```tsx
import Overview from "./pages/Overview";
```

And add the route:

```tsx
<Route path="/overview" element={<Overview />} />
```

- [ ] **Step 4: Add nav item to AppSidebar.tsx**

In the `product` nav section in `AppSidebar.tsx`, add after the "Home" route. Also add `ChartLineUp` to the Phosphor Icons import at the top of the file:

```tsx
import { ..., ChartLineUp } from "@phosphor-icons/react";
```

Then add the route:

```tsx
{
    id: "overview",
    title: "Overview",
    icon: <ChartLineUp weight="light" size={15} className={iconCls} />,
    link: "/overview",
},
```

- [ ] **Step 5: Add breadcrumb to DashboardLayout.tsx**

Add to `routeBreadcrumbLabels` in `DashboardLayout.tsx`:

```tsx
"/overview": "Overview",
```

- [ ] **Step 6: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 7: Commit**

```bash
git add src/pages/Overview.tsx src/components/DateRangePicker.tsx src/App.tsx src/components/AppSidebar.tsx src/components/DashboardLayout.tsx src/pages/Dashboard.tsx
git commit -m "feat: add Overview page with routing, sidebar nav, and breadcrumb"
```

---

### Task 7: Integration Test & Final Verification

**Files:**
- Create: `src/test/overviewPage.test.tsx`

- [ ] **Step 1: Write integration test**

Create `src/test/overviewPage.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Overview from "../../src/pages/Overview";

// Mock apiFetch
vi.mock("../../src/lib/api", () => ({
  apiFetch: vi.fn(),
}));

// Mock DateRangePicker
vi.mock("../../src/components/DateRangePicker", () => ({
  DateRangePicker: ({ value, onChange }: { value: any; onChange: any }) => (
    <div data-testid="date-range-picker">DateRangePicker</div>
  ),
}));

import { apiFetch } from "../../src/lib/api";

const mockOverviewData = {
  kpis: {
    totalOrders: { value: 245, trend: 12.4, previousValue: 218 },
    revenue: { value: 184320, trend: 8.2, previousValue: 170280 },
    profitMargin: { value: 23.5, trend: -2.1, previousValue: 25.6 },
    deliverySuccess: { value: 87.3, trend: 3.2, previousValue: 84.1 },
    unreadMessages: { value: 12, trend: -40, previousValue: 20 },
  },
  orderVolumeSeries: [
    { date: "2026-08-07", current: 32, previous: 28 },
    { date: "2026-08-08", current: 45, previous: 30 },
    { date: "2026-08-09", current: 38, previous: 35 },
    { date: "2026-08-10", current: 50, previous: 40 },
    { date: "2026-08-11", current: 42, previous: 38 },
    { date: "2026-08-12", current: 55, previous: 42 },
    { date: "2026-08-13", current: 48, previous: 45 },
  ],
  revenueSeries: [
    { date: "2026-08-07", revenue: 12400, cog: 7200, shipping: 1800, profit: 3400 },
    { date: "2026-08-08", revenue: 15600, cog: 8100, shipping: 2200, profit: 5300 },
    { date: "2026-08-09", revenue: 11200, cog: 6800, shipping: 1600, profit: 2800 },
    { date: "2026-08-10", revenue: 18900, cog: 9500, shipping: 2500, profit: 6900 },
    { date: "2026-08-11", revenue: 14300, cog: 7600, shipping: 2000, profit: 4700 },
    { date: "2026-08-12", revenue: 21000, cog: 10200, shipping: 2800, profit: 8000 },
    { date: "2026-08-13", revenue: 17500, cog: 8900, shipping: 2300, profit: 6300 },
  ],
  courierPerformance: {
    steadfast: { delivered: 180, in_transit: 20, failed: 12, pending: 8 },
    pathao: { delivered: 95, in_transit: 8, failed: 5, pending: 3 },
  },
  socialInbox: {
    unread: 12,
    avgResponseTimeMinutes: 45,
    conversationsToday: 28,
    byChannel: { facebook: 18, instagram: 7, whatsapp: 3 },
  },
  customerRetention: {
    repeatRate: 34.2,
    repeatCustomers: 84,
    totalCustomers: 245,
    topCustomers: [
      { name: "Ayesha", phone: "01711111111", orderCount: 12, totalSpent: 45200 },
      { name: "Bashir", phone: "01722222222", orderCount: 8, totalSpent: 32100 },
    ],
  },
};

describe("Overview Page", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOverviewData),
    } as Response);
  });

  it("renders all KPI cards", async () => {
    render(<Overview />);
    await waitFor(() => {
      expect(screen.getByText("Total Orders")).toBeInTheDocument();
      expect(screen.getByText("Revenue")).toBeInTheDocument();
      expect(screen.getByText("Profit Margin")).toBeInTheDocument();
      expect(screen.getByText("Delivery Success")).toBeInTheDocument();
      expect(screen.getByText("Unread Messages")).toBeInTheDocument();
    });
  });

  it("renders chart titles", async () => {
    render(<Overview />);
    await waitFor(() => {
      expect(screen.getByText("Order Volume")).toBeInTheDocument();
      expect(screen.getByText("Revenue vs Costs")).toBeInTheDocument();
    });
  });

  it("renders panel titles", async () => {
    render(<Overview />);
    await waitFor(() => {
      expect(screen.getByText("Courier Performance")).toBeInTheDocument();
      expect(screen.getByText("Inbox Activity")).toBeInTheDocument();
      expect(screen.getByText("Retention")).toBeInTheDocument();
    });
  });

  it("displays correct KPI values", async () => {
    render(<Overview />);
    await waitFor(() => {
      expect(screen.getByText("245")).toBeInTheDocument();
      expect(screen.getByText("12")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run all overview tests**

Run: `npx vitest run src/test/overview -v`
Expected: All tests PASS

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests PASS (no regressions)

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/test/overviewPage.test.tsx
git commit -m "test: add Overview page integration tests"
```
