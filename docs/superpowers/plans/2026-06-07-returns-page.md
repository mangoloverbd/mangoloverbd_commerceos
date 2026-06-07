# Returns Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Returns page with full return management for Steadfast and Pathao couriers — view returned orders, request returns, track return progress, and show actual courier fees lost.

**Architecture:** Backend endpoints query orders with return-related courier statuses from both `orders` and `social_inbox_orders` tables. Return requests call Steadfast `POST /create_return_request` or Pathao `POST /orders/{id}/cancel`. Frontend shows a filterable table with courier logos, return status, and financial impact.

**Tech Stack:** Express.js backend (server/index.js), React + TypeScript + Tailwind + Framer Motion frontend, Supabase PostgreSQL, Steadfast & Pathao courier APIs.

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `server/index.js` | Modify | Add return columns migration, GET /api/returns, POST /api/returns/request, GET /api/returns/sync endpoints |
| `src/pages/Returns.tsx` | Create | Returns page component |
| `src/components/AppSidebar.tsx` | Modify | Add "Logistics" section with Returns nav item |
| `src/App.tsx` | Modify | Register /returns route |

---

### Task 1: Database migration — add return tracking columns

**Files:**
- Modify: `server/index.js` (inside MULTI_TENANCY_SQL block)

- [ ] **Step 1: Add columns to the migration SQL**

In `server/index.js`, find the `MULTI_TENANCY_SQL` template string. After the existing products/embedding columns, add:

```sql
-- ── Return tracking columns ──────────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_fee NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS return_status TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS return_reason TEXT;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS courier_fee NUMERIC;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMPTZ;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS return_status TEXT;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS return_reason TEXT;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS courier_name TEXT;
```

- [ ] **Step 2: Commit**

```bash
git add server/index.js
git commit -m "feat: add return tracking columns to orders tables"
```

---

### Task 2: Backend — GET /api/returns endpoint

**Files:**
- Modify: `server/index.js` (add after the Steadfast/Pathao refresh-status endpoints)

- [ ] **Step 1: Add the returns list endpoint**

```js
// ── Returns ──────────────────────────────────────────────────────────────────

app.get("/api/returns", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    // Fetch returned/return-pending orders from main orders table
    const { data: mainOrders } = await supabase
      .from("orders")
      .select("id, order_number, customer_name, phone, product, price, courier_status, courier_name, courier_fee, consignment_id, return_status, return_reason, return_requested_at, sent_to_courier, created_at")
      .eq("org_id", orgId)
      .eq("sent_to_courier", true)
      .or("courier_status.ilike.%return%,return_status.neq.null,courier_status.eq.cancelled");

    // Fetch returned/return-pending orders from social inbox orders table
    const { data: inboxOrders } = await supabase
      .from("social_inbox_orders")
      .select("id, contact_name, items, total_price, courier_status, courier_name, courier_fee, consignment_id, return_status, return_reason, return_requested_at, sent_to_courier, notes, created_at")
      .eq("org_id", orgId)
      .eq("sent_to_courier", true)
      .or("courier_status.ilike.%return%,return_status.neq.null,courier_status.eq.cancelled");

    // Normalize into unified shape
    const returns = [];

    for (const o of (mainOrders || [])) {
      returns.push({
        id: o.id,
        source: "shopify",
        order_number: o.order_number,
        customer_name: o.customer_name || "Unknown",
        phone: o.phone || "",
        product: o.product || "",
        cod_amount: o.price || 0,
        courier_name: o.courier_name || "unknown",
        courier_status: o.courier_status || "",
        courier_fee: o.courier_fee || null,
        consignment_id: o.consignment_id || "",
        return_status: o.return_status || (o.courier_status || "").toLowerCase().includes("return") ? "returned" : "cancelled",
        return_reason: o.return_reason || "",
        return_requested_at: o.return_requested_at || null,
        created_at: o.created_at,
      });
    }

    for (const o of (inboxOrders || [])) {
      const notesStr = o.notes || "";
      const phoneMatch = notesStr.match(/Phone:\s*([^,\n]+)/i);
      const items = o.items || [];
      const productStr = items.map((i) => `${i.quantity || 1}x ${i.product}`).join(", ");
      returns.push({
        id: o.id,
        source: "inbox",
        order_number: `IO-${o.id.slice(-6).toUpperCase()}`,
        customer_name: o.contact_name || "Unknown",
        phone: phoneMatch?.[1]?.trim() || "",
        product: productStr,
        cod_amount: o.total_price || 0,
        courier_name: o.courier_name || "unknown",
        courier_status: o.courier_status || "",
        courier_fee: o.courier_fee || null,
        consignment_id: o.consignment_id || "",
        return_status: o.return_status || (o.courier_status || "").toLowerCase().includes("return") ? "returned" : "cancelled",
        return_reason: o.return_reason || "",
        return_requested_at: o.return_requested_at || null,
        created_at: o.created_at,
      });
    }

    // Sort by most recent first
    returns.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Calculate summary
    const summary = {
      total: returns.length,
      totalLostRevenue: returns.reduce((s, r) => s + (r.cod_amount || 0), 0),
      totalCourierFeesLost: returns.reduce((s, r) => s + (r.courier_fee || 0), 0),
      pending: returns.filter((r) => r.return_status === "pending").length,
      processing: returns.filter((r) => ["approved", "processing"].includes(r.return_status)).length,
      completed: returns.filter((r) => ["completed", "returned"].includes(r.return_status)).length,
    };

    return res.json({ returns, summary });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add server/index.js
git commit -m "feat: add GET /api/returns endpoint"
```

---

### Task 3: Backend — POST /api/returns/request endpoint

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add the return request endpoint**

```js
app.post("/api/returns/request", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const { orderId, source, reason } = req.body;
    if (!orderId) return res.status(400).json({ error: "orderId required" });

    const table = source === "inbox" ? "social_inbox_orders" : "orders";

    // Fetch the order
    const { data: order, error: orderErr } = await supabase
      .from(table)
      .select("id, consignment_id, courier_name, courier_status, sent_to_courier")
      .eq("id", orderId)
      .eq("org_id", orgId)
      .single();

    if (orderErr || !order) return res.status(404).json({ error: "Order not found" });
    if (!order.sent_to_courier) return res.status(400).json({ error: "Order not sent to courier yet" });
    if (!order.consignment_id) return res.status(400).json({ error: "No consignment ID" });

    const courierName = (order.courier_name || "").toLowerCase();
    let returnResult = null;

    if (courierName === "steadfast" || (!courierName && true)) {
      // Steadfast: POST /create_return_request
      const cfg = await getOrgSettings(orgId, ["steadfast_api_key", "steadfast_secret_key"]);
      if (!cfg.steadfast_api_key || !cfg.steadfast_secret_key) {
        return res.status(400).json({ error: "Steadfast not configured" });
      }

      const sfRes = await fetch("https://portal.packzy.com/api/v1/create_return_request", {
        method: "POST",
        headers: {
          "Api-Key": cfg.steadfast_api_key,
          "Secret-Key": cfg.steadfast_secret_key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          consignment_id: order.consignment_id,
          reason: reason || "",
        }),
      });

      const sfData = await sfRes.json();
      if (!sfRes.ok) {
        return res.status(400).json({ error: sfData?.message || "Steadfast return request failed" });
      }
      returnResult = sfData;

    } else if (courierName === "pathao") {
      // Pathao: POST /orders/{id}/cancel
      const accessToken = await getPathaoToken(orgId);
      const pathaoRes = await fetch(
        `https://api-hermes.pathao.com/aladdin/api/v1/orders/${order.consignment_id}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      );

      const pathaoData = await pathaoRes.json();
      if (!pathaoRes.ok) {
        return res.status(400).json({ error: pathaoData?.message || "Pathao cancel request failed" });
      }
      returnResult = pathaoData;
    } else {
      return res.status(400).json({ error: "Unknown courier" });
    }

    // Update order with return info
    const now = new Date().toISOString();
    await supabase.from(table).update({
      return_status: "pending",
      return_reason: reason || null,
      return_requested_at: now,
    }).eq("id", orderId).eq("org_id", orgId);

    return res.json({ success: true, return_status: "pending", result: returnResult });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add server/index.js
git commit -m "feat: add POST /api/returns/request endpoint for Steadfast and Pathao"
```

---

### Task 4: Backend — GET /api/returns/sync endpoint

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add the returns sync endpoint**

```js
app.get("/api/returns/sync", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    // Sync Steadfast return requests
    const cfg = await getOrgSettings(orgId, ["steadfast_api_key", "steadfast_secret_key"]);
    let steadfastSynced = 0;

    if (cfg.steadfast_api_key && cfg.steadfast_secret_key) {
      try {
        const sfRes = await fetch("https://portal.packzy.com/api/v1/get_return_requests", {
          headers: {
            "Api-Key": cfg.steadfast_api_key,
            "Secret-Key": cfg.steadfast_secret_key,
            "Content-Type": "application/json",
          },
        });

        if (sfRes.ok) {
          const sfData = await sfRes.json();
          const requests = Array.isArray(sfData) ? sfData : (sfData?.data || []);

          for (const rr of requests) {
            if (!rr.consignment_id || !rr.status) continue;
            // Update orders table
            const { data: updated } = await supabase
              .from("orders")
              .update({ return_status: rr.status })
              .eq("consignment_id", String(rr.consignment_id))
              .eq("org_id", orgId)
              .select("id");
            if (updated?.length) { steadfastSynced++; continue; }
            // Try inbox orders table
            await supabase
              .from("social_inbox_orders")
              .update({ return_status: rr.status })
              .eq("consignment_id", String(rr.consignment_id))
              .eq("org_id", orgId);
            steadfastSynced++;
          }
        }
      } catch (err) {
        console.warn("[Returns Sync] Steadfast failed:", err.message);
      }
    }

    return res.json({ synced: steadfastSynced });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add server/index.js
git commit -m "feat: add GET /api/returns/sync endpoint for Steadfast return status sync"
```

---

### Task 5: Frontend — Returns page component

**Files:**
- Create: `src/pages/Returns.tsx`

- [ ] **Step 1: Create the Returns page**

Create `src/pages/Returns.tsx` with the full component (header, filter tabs, table with courier logos, request return button, summary metrics).

The page should:
- Call `GET /api/returns` on mount via TanStack Query
- Show summary cards: Total Returns, Lost Revenue (৳), Courier Fees Lost (৳)
- Filter tabs: All | Pending | Processing | Completed
- Table columns: Order ID, Customer, Phone, Product, COD Amount, Courier (Steadfast/Pathao logo), Return Status, Courier Fee, Date
- "Request Return" button on orders that are `sent_to_courier: true` but don't have a return_status yet (shown via a popover with reason input)
- "Sync Returns" button in header that calls `GET /api/returns/sync`
- Match existing design: `bg-[#FAFAF8]`, `rounded-[14px]` cards, Phosphor Icons weight="light", uppercase tracking labels

- [ ] **Step 2: Commit**

```bash
git add src/pages/Returns.tsx
git commit -m "feat: add Returns page component"
```

---

### Task 6: Sidebar — add Logistics section

**Files:**
- Modify: `src/components/AppSidebar.tsx`

- [ ] **Step 1: Add Logistics section with Returns item**

In `AppSidebar.tsx`, after the `socialInbox` section definition (around line 121), add a new section:

```tsx
const logistics: NavSection = {
    label: "Logistics",
    routes: [
        {
            id: "returns",
            title: "Returns",
            icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor" className={iconCls}><path d="M232,128A104,104,0,0,1,77.18,207.47a8,8,0,0,1,5.64-14.94,88,88,0,1,0-34.63-37.73l9.23-6.15a8,8,0,0,1,8.88,13.32l-24,16a8,8,0,0,1-11.62-3.52l-16-32a8,8,0,1,1,14.32-7.12l6.19,12.39A104,104,0,0,1,232,128Z"/></svg>,
            link: "/returns",
        },
    ],
};
```

Then add it to the sections array:

```tsx
const sections = [product];
sections.push(workspace);
sections.push(socialInbox);
sections.push(logistics);
return sections;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AppSidebar.tsx
git commit -m "feat: add Logistics section with Returns to sidebar"
```

---

### Task 7: Route registration

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import Returns page and add route**

Add the import at the top of `src/App.tsx`:

```tsx
const Returns = lazy(() => import("./pages/Returns"));
```

Add the route inside the DashboardLayout Route group (after the `/billing` route):

```tsx
<Route path="/returns" element={<Returns />} />
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: register /returns route"
```

---

### Task 8: Update Pathao status polling to capture delivery_fee

**Files:**
- Modify: `server/index.js` (inside `POST /api/pathao/refresh-status`)

- [ ] **Step 1: Store delivery_fee from Pathao order info response**

In the Pathao refresh-status endpoint, after getting `info` from the Pathao API, add courier_fee to the patch:

```js
// Inside the for loop, after: const patch = { courier_status: newStatus };
// Add:
if (info?.data?.delivery_fee != null) {
  patch.courier_fee = Number(info.data.delivery_fee) + Number(info.data.cod_fee || 0);
}
```

- [ ] **Step 2: Commit**

```bash
git add server/index.js
git commit -m "feat: store Pathao delivery_fee when polling status"
```

---

### Task 9: Final verification

- [ ] **Step 1: Syntax check**

```bash
node -c server/index.js
```

- [ ] **Step 2: Commit all and push**

```bash
git add -A
git commit -m "feat: Returns page — full return management for Steadfast and Pathao"
git push origin main
```
