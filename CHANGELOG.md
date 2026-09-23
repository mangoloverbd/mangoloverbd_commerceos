# Changelog

## [0.1.0.34] - 2026-09-23

### Added

- Print tab gets the same bottom Previous/Next order navigator as the Pending tab (`N of M print`, print-orders only). The order queue is now per-tab with separate snapshots.

## [0.1.0.33] - 2026-09-23

### Added

- Advance / partial payment on New Order and the Order editor: inline ৳ input (empty at zero, capped at the total), green due chip, and `Paid` state at full payment. The orders table Total shows the due with a small adv chip, the invoice shows Advance paid + Amount due, and Steadfast/Pathao collect the due only.

## [0.1.0.32] - 2026-09-23

### Fixed

- Abandoned-checkout convert now matches variant-suffixed cart names (e.g. `Katimon Mango (6KG)`) to catalog products via exact, stripped, and fuzzy match, and persists resolved `product_id`/`variant_id` into `order_items` so warehouse routing and weight stay linked.
- Product warehouse reassignment now resyncs open auto-routed orders (`warehouse_auto = true`): bulk-assign, single product edit, and warehouse delete re-resolve affected orders and return `resynced_orders`. Manual overrides and dispatched/final orders are never touched.

## [0.1.0.31] - 2026-09-23

### Added

- Order and abandoned-checkout editors now have an **Order details | Logs** switch. Logs slides in with the order's full, always-expanded activity history, updates live every 2 seconds while open, and opens instantly because activity is loaded with the page.
- Logs explain changes at a glance: status changes show before and after status chips, item edits show a summary with the total difference plus Added, Removed, quantity, and discount chips with taka impact, and other field edits read as `Label before → after`.

### Changed

- The compact activity timeline was removed from the customer panel; the Logs tab replaces it. Unsaved edits are kept when switching tabs, and `?tab=logs` reopens Logs after a reload.
- Legacy variant names stored as JSON, such as `{"size":"১ কেজি"}`, now display as readable text in Logs.

## [0.1.0.30] - 2026-09-23

### Added

- Added Staff Performance to Overview with assigned, confirmed, value, delivery-rate, and top-staff metrics.
- Added Pending Fulfillment as an actionable Overview KPI with period-over-period comparison.

### Changed

- Expanded Courier Performance with shipment totals, status breakdowns, and delivery pipeline shares.
- Expanded Retention with average orders per customer and average customer value.
- Aligned the Overview operational cards and anchored their final sections to the shared card height.

## [0.1.0.29] - 2026-09-23

### Changed

- Sidebar navigation now uses Geist Sans, 13px primary labels, calmer active and inactive contrast, a slightly wider layout, Reports above Intelligence, and the shorter Staff label.

### Removed

- Removed Billing & Plan, the copyright/help controls, and the FraudShield usage summary from their respective interfaces.

## [0.1.0.28] - 2026-09-23

### Added

- Detailed per-order activity history for regular, inbox, and abandoned orders, including immutable provenance, actor attribution, structured change reasons, before/after values, meaningful-view deduplication, and operational events for printing, messaging, fraud checks, and courier actions.
- Compact expandable activity timelines that show five recent events by default, semantic BoardUI chips, exact timestamps, and full-history access.
- Staff performance reporting for retained upsell value and detailed order activity.

### Changed

- Order and inbox editors now require structured reasons for audited item additions and cancellations, group save events, and recover safely from stale-write conflicts.
- Main Cancel actions in the existing-order and new-order editors now use the BoardUI ghost button.

## [0.1.0.27] - 2026-09-22

### Fixed

- Pending Previous/Next navigation now appears when an order is opened in a new tab from the Dashboard Pending tab: the queue snapshot persists to localStorage with a `?fulfillmentTab=pending` link tag and a 30-minute expiry.

## [0.1.0.26] - 2026-09-22

### Added

- Activity Log report (`/reports/activity`) — a chronological, filterable feed of every staff confirm/cancel/contact/dismiss/convert action across orders, inbox orders, and abandoned carts, with the same design language as Staff Performance and Business Report.
- Per-order activity timeline embedded on the order editor, the abandoned-checkout editor, and an inbox-order popover, so "who did what" is visible on the order itself, not just the report.
- `order_status_events` now also records abandoned-checkout Contacted/Dismissed/Reopened actions, closing the only order-shaped table with no staff attribution.
- Staff Performance now reports abandoned-cart handling per staff member — Contacted, Dismissed, Reopened, and Converted counts plus converted value — as its own detail group and a quick-glance chip on each staff card.

### Fixed

- Converting an abandoned checkout into an order (`POST /api/abandoned-checkouts/:id/convert`) now stamps `created_by`, `assigned_to`, and confirmation attribution and writes the matching audit events — previously the resulting order had no recorded confirmer at all.

## [0.1.0.25] - 2026-09-22

### Added

- Dashboard order IDs now open the existing order editor in a new tab on desktop and mobile while preserving the current Dashboard state and existing same-tab row/card navigation.

## [0.1.0.24] - 2026-09-22

### Changed

- Serve stock-free public product catalogs from a 30-second shared cache while keeping browsers uncached and inventory on its separate five-second endpoint.
- Vary cached catalog responses by request origin so CORS headers cannot be shared between storefront origins.

### Fixed

- Purge and warm public catalog URLs after published product and variant catalog changes, including ordinary product edits, while leaving stock-only edits on the short inventory cache.

## [0.1.0.23] - 2026-09-21

### Added

- Order editor "Last orders" entries are clickable cards that open the order in the editor (dashboard tab preserved), showing CN No, courier, and color-coded courier-status chips (BoardUI Chip) in a balanced two-column layout.

## [0.1.0.22] - 2026-09-21

### Fixed

- Order editor saves failing with "UPDATE requires a WHERE clause": the `replace_order_items` discount refresh updated its temp table with no `WHERE` clause, which the managed project rejects. Added an always-true predicate (every row carries a product or variant id at that point). Canonical migration `20260921000000_fix_replace_order_items_where_guard.sql`.
- Dashboard order tabs resetting to All Orders after opening an order: the tab now travels in navigation state from the table to the order editor and back, with a per-session fallback so browser-back returns to the same tab.

### Changed

- Redesigned the date-range preset list (Staff Performance, Business Report, Dashboard, Overview): grouped icon rows (All Time/Today/Yesterday, Last 7/30/90 Days, This Week/Month, Last Month, This Year) with dividers and a blue selected highlight; compact sizing to match the calendar height.
- Dashboard date picker dropdown now opens centered below its trigger; other pages keep the right-aligned placement.
- Yesterday preset uses a custom circular history-arrow icon.

## [0.1.0.21] - 2026-09-21

### Added

- New Order page now supports per-item discounts (fixed amount or percentage, same editor as the Order editor) and an overall cart discount, instead of a single fixed-amount discount field.
- `POST /api/orders` accepts and validates per-item `discount_type`/`discount_value`, computes `unit_discount` server-side, and verifies the aggregate discount never exceeds the merchandise subtotal (recomputes `price`/`quantity` from the items).

### Changed

- New Order cart restructured to match the Order editor: scrollable item list on top, pinned summary below (Delivery, discount, Subtotal, Advance, Final total, compact payment dropdown, note icon with dropdown editor, Cancel/Create order buttons inside the card).
- Adding a product auto-scrolls the cart to the new line for preview; the page toolbar sticks on scroll and the workspace fills the viewport height.

## [0.1.0.20] - 2026-09-21

### Changed

- Redesign the New Order page's left column into two self-contained cards ("Customer details" and "Order settings") matching the Courier Delivery panel's header style, with leading icons on the Name/Phone/Address fields and a "New customer" reset button, instead of one stretched field grid with dead vertical gaps.
- Grow the Delivery address textarea so the left column's height sits closer to the right panel's when a customer has a handful of couriers with data.
- Cap the FraudShield "By courier" list at 4 visible rows (sorted by parcel volume) on all three order-editor pages; the rest collapse into a "+N more couriers" trigger that reveals them on hover instead of listing every courier unbounded.

## [0.1.0.19] - 2026-09-21

### Changed

- Redesign the FraudShield risk panel on the Order editor, Abandoned order editor, and New order pages: a "Courier Delivery" header with a compact "Last updated" re-check button, and six flat `#e8e8e6` stat cards (Safe/Caution/High, success rate, delivered, cancelled, total, risk score) laid out 3-up/3-down instead of the old inline chip row.

## [0.1.0.18] - 2026-09-21

### Changed

- Make FraudShield courier logos in the order-editor risk panel bigger and legible (wide wordmark slot with multiply blending instead of a cramped 20px square).
- Tighten the left/right/top page margins on the Order editor, Abandoned order editor, and New order pages so more of the panel is visible without scrolling.

## [0.1.0.17] - 2026-09-21

### Fixed

- Make bulk fraud verification cache-aware: the bulk buttons now send `force: false`, so numbers checked within the last 30 days reuse cache instead of re-spending a request each. Single checks still force a fresh lookup. The toast reports how many were reused from cache.

## [0.1.0.16] - 2026-09-21

### Changed

- Rebuild the date-range picker used on Overview, Dashboard, Staff Performance, and Business Report with BoardUI's dual-month calendar card: editable start/end date chips, a "N days selected" summary, and an explicit Cancel/Apply step for custom ranges. The trigger button (icon, date text, border) and one-click preset list (Today, Yesterday, Last 7 Days, etc.) are unchanged.

## [0.1.0.15] - 2026-09-21

### Fixed

- Disable the automated FraudShield warming cron (every 5 minutes, up to 40 phones per run over the last 7 days), which drained the daily FraudShield quota down to the 100-request reserve even with few new orders. The endpoint now fails closed with 410.
- Keep the order-editor fraud Check/Retry buttons enabled when the cached state says "Daily limit reached" — the cached message can be stale across the daily quota reset — and give quota-blocked numbers a force Retry that makes a live call.

## [0.1.0.14] - 2026-09-21

### Changed

- Give কালোজিরা মিক্সড | Kalojira Mixed free delivery, matching the existing honey products.

## [0.1.0.13] - 2026-09-20

### Changed

- Give Staff Performance and Business Report their own sidebar icons instead of sharing one.

## [0.1.0.12] - 2026-09-20

### Fixed

- Stretch Business Report day-granularity intake bars across the full chart width with single-line labels, so multi-day ranges read as clean as the hourly Today view.

## [0.1.0.11] - 2026-09-20

### Added

- Open the admin-only Business Report for regular-order intake, source performance, Website landing pages, and delivery economics over Dhaka-local date ranges, with an hourly chart for single days and daily buckets for longer ranges.
- Cover Business Report dates, outcome precedence, fulfillment fallback, fee coverage, and admin route wiring with regression tests.

### Fixed

- Reject Business Report ranges with future Dhaka dates or more than 366 days, and keep terminal courier returns ahead of legacy cancelled business status.
- Point the Staff Performance product-variants read at the shared report pagination helper after the base-branch merge.

## [0.1.0.10] - 2026-09-19

### Changed

- Review staff performance in a full-width, ranked regular-order card queue with team snapshots, color-coded outcome counts, and expandable operational detail.
- Keep Social Inbox metrics out of the Staff Performance page while preserving the underlying report response for future reporting work.
- Show the Dashboard / Staff Performance breadcrumb and a streamlined Staff Performance page header.

## [0.1.0.9] - 2026-09-18

### Added

- Attribute manually created and social inbox orders to the staff member who creates, is assigned, confirms, or cancels them, with immutable status-transition history.
- Add the Staff Performance report with role-safe staff filtering, Dhaka-local date ranges, and separate regular-order and social-inbox metrics.

### Fixed

- Keep staff reporting accurate for historical activity, courier-driven status changes, malformed legacy inbox items, and high-volume report queries.

## [0.1.0.8] - 2026-09-17

### Changed

- Manual Create Order submissions save directly as Approved instead of Pending.

## [0.1.0.7] - 2026-09-17

### Fixed

- Batch unbounded order id fetches that failed past URL limits, restoring the orders queue at higher order volumes.
- Remove the AI district fallback; harden the built-in matcher for misspellings, Bengali unicode variants, inserted spaces, and Bengali area names.

## [0.1.0.6] - 2026-09-17

### Added

- Add an Approved-tab district filter with per-district order counts and automatic AI resolution of unknown addresses that learns into org settings without touching order data.

## [0.1.0.5] - 2026-09-17

### Added

- Add a Packing Summary print action to the Dashboard Print tab: per-product/pack totals with order counts, total kg, and tick boxes, plus a multi-item exception list with order IDs and ticks.

## [0.1.0.4] - 2026-09-14

### Added

- Let staff choose an order source when creating an order and edit it later, including after courier dispatch.

### Changed

- Validate canonical order sources, normalize legacy Website values, and preserve source metadata across storefront order flows.

## [0.1.0.3] - 2026-09-14

### Changed

- Add a reversible `ORDER_PROTECTION_MODE=off` switch for temporarily bypassing storefront order protection.

## [0.1.0.2] - 2026-09-13

### Changed

- Prepare fresh Amp orbs with the pinned Node.js toolchain, cached npm dependencies, and PostgreSQL test tools.

## [0.1.0.1] - 2026-09-13

### Changed

- Hide the Ready To Ship tab from Dashboard and Warehouse Detail.
- Classify dispatched Steadfast orders into Processing, In-Transit, or Flagged while showing their consignment ID in Processing.

## [0.1.0.0] - 2026-09-13

### Added

- Send an individual SMS to a saved order phone number from the order editor.
- Open a one-click WhatsApp chat for an order directly from its customer panel.
- Compose SMS messages with quick order-value inserts and a Unicode length limit.
- Keep manual SMS requests authenticated, workspace-scoped, and connected to the existing Bulk SMS BD gateway.

### Fixed

- Apply the standard ৳100 delivery charge to public storefront orders below the free-delivery threshold when no shipping zone is selected.


## [0.0.2.4] - 2026-09-12

### Changed

- Shorten the dashboard fulfillment queue tab label from Abandoned Carts to Abandoned.

## [0.0.2.3] - 2026-09-11

### Changed

- Hide the Risk column on the Dashboard orders table while preserving it elsewhere.

## [0.0.2.2] - 2026-09-11

### Added

- Add independent on/off controls for order confirmation and dispatch SMS templates.

## [0.0.2.1] - 2026-09-11

### Fixed

- Send confirmation SMS when dashboard, storefront, or Social Inbox orders are created in Pending status.
- Avoid sending a duplicate confirmation SMS when an executive approves an order.

## [0.0.2.0] - 2026-09-10

### Changed

- Keep orders sent to Steadfast in Print with their consignment IDs until they are manually moved to Processing.

## [0.0.1.1] - 2026-09-08

### Fixed

- Keep newly published products visible on the public storefront after a refresh.
- Refresh public catalog data when product details change instead of reusing an incomplete ETag.

## [0.0.1.0] - 2026-09-08

### Added

- Send selected Print orders to Steadfast in one bulk dispatch.

### Changed

- Keep failed dispatches in Print and show the result for each order.
- Limit Print-tab bulk actions to the fulfillment actions relevant to that workflow.
