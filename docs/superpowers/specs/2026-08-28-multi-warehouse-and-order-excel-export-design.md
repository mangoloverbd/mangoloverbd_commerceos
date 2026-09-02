# Multi-Warehouse Routing and Order Excel Export — Design

**Date:** 2026-08-28
**Status:** Approved, ready for implementation planning
**Deployment:** Mango Lover BD (single-tenant)

## Context

The client asked for two things over WhatsApp on 2026-08-28:

1. **Unlimited warehouses**, with products assigned per warehouse, so that when an order
   arrives the system automatically knows which warehouse that order's product belongs to.
   Their stated setup: one main warehouse named **Mango Lover** holding every non-mango
   product, with additional mango warehouses opened seasonally.
2. **An Excel export of confirmed orders** containing customer name, phone, address,
   weight in kg, product, and Steadfast ID.

Orders reach this deployment through exactly two paths: **storefront checkout** and
**social inbox**. Shopify sync exists in the code but is not an active source for this
client, so no imported free-text order data needs to be matched.

## Non-goals

Explicitly out of scope. Each can be added later without reworking anything below.

- Per-warehouse stock counts. Stock remains one number per product/variant, preserving the
  existing "one source of stock truth" rule in `CLAUDE.md`.
- Stock transfers between warehouses.
- Per-warehouse analytics or P&L.
- Assigning team members to warehouses.
- An active/inactive toggle on warehouses. The client will create mango warehouses when the
  season starts; a warehouse that is no longer used is simply not assigned any products.
- Warehouse-specific courier pickup addresses. The client confirmed one global courier
  pickup point for all warehouses, so `{orgId}:pathao_store_id` stays a single setting.

## Decisions and rationale

**A warehouse is a routing label, not an inventory location.** The client's need is knowing
where to pack from, not accounting for stock in multiple places. Every product naturally
lives in exactly one warehouse under their plan, so per-warehouse stock would add schema
surgery, checkout changes, and storefront API changes for no current benefit. The
`products.warehouse_id` introduced here is exactly the "home warehouse" that a future
per-warehouse inventory model would need, so nothing is wasted.

**The warehouse is resolved once, when the order is created, and stored on the order row.**
If a product is later moved to a different warehouse, existing orders keep their original
warehouse. An order already being packed should not silently jump to another warehouse's
pick list.

**Weight lives on the variant.** The client sells by weight, so pack sizes (1kg, 5kg) are
product variants, and the weight is entered when the product and its variants are created.
`products.weight_kg` exists only as a fallback for products that have no variants.

**A warehouse is never empty on an order.** Unresolvable products route to the default
warehouse rather than to null.

**An order containing products from two warehouses routes to the first resolvable product's
warehouse** and keeps `warehouse_auto = true`, so staff can see the value was guessed. Split
shipments are not modelled.

**An order's weight is blank unless every item's weight is known.** A partially summed weight
on a courier handover document is worse than an empty cell, because it looks correct.

**Excel rather than CSV.** Customer names and addresses are in Bangla. A plain CSV opened in
Excel renders Bangla as garbage unless a UTF-8 BOM is written, and even then behaviour varies
by Excel version. A real `.xlsx` file has no encoding ambiguity. This justifies one new
dependency, `exceljs`.

## Data model

New table `public.warehouses`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid not null | fixed Mango Lover BD workspace guard |
| `name` | text not null | |
| `address` | text | |
| `contact_person` | text | |
| `phone` | text | |
| `is_default` | boolean not null default false | at most one true per org |
| `deleted_at` | timestamptz | soft delete, preserves order history |
| `created_at` / `updated_at` | timestamptz | `updated_at` via existing trigger |

Constraints and indexes:

- `unique (org_id, name) where deleted_at is null`
- `unique index on (org_id) where is_default and deleted_at is null` — enforces one default
- `index on (org_id, deleted_at, created_at desc)`

Added columns:

| Table | Column | Type | Notes |
|---|---|---|---|
| `products` | `warehouse_id` | uuid null → `warehouses(id)` | null means default warehouse |
| `products` | `weight_kg` | numeric(10,3) null, `>= 0` | fallback for variant-less products |
| `product_variants` | `weight_kg` | numeric(10,3) null, `>= 0` | authoritative weight |
| `orders` | `warehouse_id` | uuid null → `warehouses(id)` | routing snapshot |
| `orders` | `warehouse_auto` | boolean not null default true | false once a human sets it |
| `orders` | `weight_kg` | numeric(10,3) null | computed at creation, staff-editable |
| `social_inbox_orders` | `warehouse_id`, `warehouse_auto`, `weight_kg` | same as `orders` | |

`social_inbox_orders.items` gains an optional `variant_id` per item so inbox orders can carry
the variant the customer agreed to. Existing items without it keep working.

Migrations follow the canonical baseline pattern in `supabase/migrations/`. On first run, a
warehouse named **Mango Lover** is created and flagged default.

## Server: warehouse resolution

One shared helper in `server/index.js`, used by every order-creation path so routing can
never diverge between sources:

```
resolveOrderRouting(orgId, lineItems) -> { warehouseId, warehouseAuto, weightKg }
```

Resolution order for the warehouse:

1. If a line item carries a real `product_id`, read that product's `warehouse_id`.
2. Otherwise match the item's product name against `products.name` for this org.
3. Take the first item that resolves; if none resolve, use the org's default warehouse.
4. `warehouseAuto` is always `true` at creation.

Weight in the same pass: for each item, `variant.weight_kg ?? product.weight_kg`, times
quantity, summed. If any item resolves to no weight, return `null` for the whole order.

Call sites:

- `handlePublicHandleOrderSubmit` (`server/index.js:8737`) — already builds `orderItems` with
  real `productId` and `variantId` per line, then discards them into a summary string. The
  resolver consumes that array before the string is built. Exact match, no name guessing.
- Social inbox order creation (`server/index.js` around 7437) — passes its `items` array,
  including `variant_id` where the AI captured one.

## Server: API routes

All routes follow the existing `getToken(req)` → `getUser(token)` → 401 guard → resolve
`org_id` from `user_roles` pattern, and every query filters by the resolved `org_id`. No route
accepts an organization or tenant id from the client.

| Route | Purpose |
|---|---|
| `GET /api/warehouses` | list non-deleted warehouses, each with its assigned product count for the table |
| `GET /api/warehouses/:id` | one warehouse with its summary figures and all assigned products; for the default warehouse, also products with no `warehouse_id` |
| `POST /api/warehouses` | create |
| `PATCH /api/warehouses/:id` | rename, edit details, set default |
| `DELETE /api/warehouses/:id` | soft delete; rejected if it is the default |
| `POST /api/products/bulk-assign-warehouse` | assign many products in one call |
| `PATCH /api/orders/:id` | extended to accept `warehouse_id` and `weight_kg`; setting `warehouse_id` sets `warehouse_auto = false` |
| `PATCH /api/social/inbox-orders/:id` | same extension |

Setting a new default clears the previous one in the same transaction.

`GET /api/orders` gains an optional `warehouse_id` filter parameter.

## Frontend

**Warehouses page** — a dedicated page at `/warehouses`, not a Settings section. A new sidebar
entry labelled **Warehouses** sits in the first (unlabelled) navigation group in
`src/components/AppSidebar.tsx`, directly after Products, since warehouses are a catalog
concern. Note that the sidebar does not use Phosphor icons: every entry is an inline two-tone
SVG using `style={{ fill: 'var(--fillg)' }}` with a `0.4` opacity secondary path. The Warehouses
icon follows that same construction so it sits correctly with its neighbours in both themes.

The route is declared in `src/App.tsx` inside `ProtectedRoute` wrapping `DashboardLayout`, like
every other authenticated page.

The page reuses the exact structure already shared by Overview, Customers, Products, and Inbox
Orders, so it reads as part of the same system rather than a bolted-on screen:

- Same page header: the `text-[8px] font-medium tracking-[0.3em] uppercase` label above a
  `font-light` heading, on the `#FAFAF8` background, with no card shadow.
- Same data table treatment as `CustomerDataTable` and the products table — borderless rows,
  hairline `border-black/[0.06]` dividers, tabular numerals for counts.
- Same controls: `Button` and `Select` from `src/components/base/`, `RichButton` for the primary
  action, `Spinner` from `src/components/ui/ios-spinner`, and `toast` from
  `src/components/ui/sonner`.
- Same data layer: `apiFetch()` through TanStack Query, and Framer Motion for row and panel
  transitions with `useReducedMotion` respected, matching Customers.

Table columns: Warehouse, Address, Contact Person, Phone, Products (count assigned), and a
Default marker. A primary **New Warehouse** action sits top-right. Row actions cover edit and
delete, and deleting the default warehouse is refused with an explanatory toast.

Create and edit happen in a dialog rather than on separate pages. A warehouse has four fields,
so the `ProductNew` / `ProductEdit` full-page pattern would be disproportionate.

**Warehouse detail page** — clicking a warehouse row opens `/warehouses/:id`, following the
same full-page pattern as `ProductEdit`. It shows:

- **Warehouse details** — name, address, contact person, phone, and whether it is the default.
  Editing opens the same dialog used for create, so there is one edit surface, not two.
- **Summary figures** in the established `text-[8px]` label over `text-2xl font-light` value
  treatment: products assigned, total units in stock across those products, and how many of
  them are published.
- **All products in this warehouse** — a table of every assigned product: name, selling price,
  stock, weight, and published state. Rows link through to `ProductEdit`. Products with no
  weight set are marked, since a missing weight is what leaves an order's weight blank in the
  Excel export.
- **Add products** — opens a picker to assign existing products to this warehouse, reusing
  `POST /api/products/bulk-assign-warehouse`. This is where merchants will naturally try to do
  it, so it belongs here as well as on the Products page.
- **Remove from warehouse** — a row action that clears the product's `warehouse_id`, returning
  it to the default warehouse. Products are never left unassigned in a way that breaks routing.
- **Orders in this warehouse** — the real `OrdersTable` component, embedded, showing only this
  warehouse's orders. `OrdersTable` (`src/components/OrdersTable.tsx:492`) takes `orders`,
  `loading`, `onStatusUpdate`, and `onOrderUpdate` and owns no fetching of its own, so the page
  fetches `GET /api/orders?warehouse_id=:id` and passes the rows straight in. The selection bar
  comes with it unchanged — fraud check, Invoice, Print, Excel, status changes, and courier
  dispatch all work here exactly as they do on the Orders page, with no duplicated code.

  Two consequences of reusing the component as-is: the Warehouse column is redundant on this
  page but kept rather than made conditional, and if staff use the inline warehouse override to
  move an order elsewhere, that row disappears from this page on the next refetch. Both are
  acceptable; neither needs special handling.

The default warehouse's detail page also lists products with no `warehouse_id` set, because
those route here. They are visually distinguished from explicitly assigned ones so the merchant
can tell the difference between "put here on purpose" and "landed here by default".


**Products page** — a warehouse picker per product, plus multi-select with a bulk "Assign to
warehouse" action, so assigning every non-mango product to Mango Lover is a few clicks. The
product form gains a weight field, and each variant row gains its own weight field.

**Orders table** (`src/components/OrdersTable.tsx`) — a Warehouse column and an inline warehouse
override on each row. Auto-routed values are visually distinguishable from human-set ones. The
warehouse **filter** goes on `src/pages/Dashboard.tsx` beside the existing search control, because
`OrdersTable` owns no filtering of its own — the dashboard already filters client-side and passes
the result in.

**Inbox orders** (`src/pages/InboxOrders.tsx`) — a variant dropdown per order line, listing
that product's variants, so staff can set or correct what the AI captured.

Follows existing conventions: `apiFetch()` for every call, TanStack Query for server state,
Phosphor icons at `weight="light"`, the `text-[8px] tracking-[0.3em] uppercase` label style,
and `৳` for currency.

## Excel export

A new **Excel** button in the floating selection bar of the orders table
(`src/components/OrdersTable.tsx:1343`, beside the existing Invoice and Print buttons), and the
same button on the inbox orders table. PDF output already exists through
`src/utils/invoiceGenerator.ts` and is not changed.

Scope is exactly the rows the user has ticked. No separate date or status filter.

New `src/lib/orderExcelExport.ts`, alongside the existing `src/lib/customerExport.ts`, generating
the file in the browser with `exceljs`. It splits into a pure row builder, which is unit-tested,
and a thin download wrapper that dynamically imports `exceljs` so the dependency is code-split.
No new API route.

Columns, in order:

| Column | Source |
|---|---|
| Order Number | `order_number`, or `IO-` prefix for inbox orders |
| Customer Name | `customer_name` / `contact_name` |
| Phone | `phone` |
| Address | `address` |
| Product | `product` summary string |
| Quantity | `quantity` |
| Weight (kg) | `weight_kg`, blank if unknown |
| COD Amount | `price` / `total_price` |
| Warehouse | warehouse name, resolved from `warehouse_id` |
| Steadfast ID | `consignment_id`, blank before dispatch |

Header row bold, column widths set, weight and COD formatted as numbers. Filename includes the
export date and, when a single warehouse filter is active, the warehouse name.

## Inbox variant capture

`extractNewFields` (`server/index.js:7609`) currently builds its catalog as `{ name, price }`,
so variants never reach the extractor and captured orders record no variant. Meanwhile the
social chat bot already sends a full variant breakdown (`server/index.js:6913`) — the
information reaches the conversation and is dropped at capture.

Changes:

- Variant labels and ids go into the extractor's catalog.
- The extractor captures the variant the customer agreed to, matched back to a real
  `product_variants` row for this org. Never invented.
- Staff can correct it from the inbox order dropdown.
- **`Send to Courier` refuses to dispatch an inbox order while a variant is missing**, with a
  message naming the order line that needs one.

The dispatch guard is the part that guarantees the export is never blank, because dispatch is
the moment the weight has to be correct. Accepted cost: staff will hit this blocker on vague
conversations and must pick the pack size before dispatching.

The guard is implemented in `src/pages/InboxOrders.tsx`, in front of both courier calls, rather
than server-side. `POST /api/inbox-orders/send-to-courier` and `POST /api/inbox-orders/send-to-pathao`
are called by that page and documented in `CLAUDE.md` §6 but do not exist in `server/index.js` on
this branch, so there is no route to attach a server-side guard to. That missing-route bug is
pre-existing and out of scope here.

## Testing

Vitest, in `src/test/`, following existing conventions.

- Warehouse resolution: exact `product_id` match; name match; no match falling back to default;
  two-warehouse order taking the first resolvable product.
- Weight calculation: variant weight preferred over product weight; quantity multiplication;
  a single unknown item forcing the whole order's weight to null.
- Default warehouse invariants: exactly one default per org; deleting the default rejected;
  setting a new default clearing the old one.
- Warehouse detail: assigned products returned for a normal warehouse; the default warehouse
  additionally returning products with no `warehouse_id`; removing a product from a warehouse
  returning it to the default.
- Manual override: setting `warehouse_id` sets `warehouse_auto = false` and later resolution
  never overwrites it.
- Excel export: correct column order, blank cells for missing weight and undispatched Steadfast
  ID, Bangla text surviving a round trip.
- Dispatch guard: inbox order with a missing variant is rejected with a clear error.
- Workspace guard: every new route rejects unauthenticated requests and filters by the resolved
  `org_id`.

## Export timing

The export is a record of orders **already sent to the courier**, not an upload template for
Steadfast. The client asked for the Steadfast ID to appear in the file, which only exists once
`consignment_id` has been written by the courier at dispatch.

The Excel button therefore stays available for any selection, but rows not yet dispatched will
show an empty Steadfast ID cell. No warning or restriction is added for this — selecting
undispatched orders is a normal thing to do, and the empty cell is self-explanatory.
