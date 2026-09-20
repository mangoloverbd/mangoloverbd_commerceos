# Changelog

## [0.1.0.15] - 2026-09-21

### Changed

- Rebuild the date-range picker used on Overview, Dashboard, Staff Performance, and Business Report with BoardUI's dual-month calendar card: editable start/end date chips, a "N days selected" summary, and an explicit Cancel/Apply step for custom ranges. The trigger button (icon, date text, border) and one-click preset list (Today, Yesterday, Last 7 Days, etc.) are unchanged.

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
