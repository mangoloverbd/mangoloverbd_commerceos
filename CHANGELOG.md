# Changelog

## [0.1.0.0] - 2026-09-13

### Added

- Send an individual SMS to a saved order phone number from the order editor.
- Open a one-click WhatsApp chat for an order directly from its customer panel.
- Compose SMS messages with quick order-value inserts and a Unicode length limit.
- Keep manual SMS requests authenticated, workspace-scoped, and connected to the existing Bulk SMS BD gateway.

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
