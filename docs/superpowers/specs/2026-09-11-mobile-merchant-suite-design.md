# Merchant Suite Mobile Workflow Design

**Date:** 2026-09-11  
**Status:** Approved for implementation  
**Scope:** Mobile phones only; desktop behavior and presentation remain unchanged.

## Goal

Make the Merchant Suite’s highest-frequency workflows practical on narrow phone
screens without squeezing desktop tables and multi-column editors into a mobile
viewport.

## Scope and breakpoint

The first pass covers the authenticated daily workflows:

- Home and orders
- Order details and editing
- Facebook, Instagram, and WhatsApp inboxes
- Products
- Customers

Mobile behavior activates below `768px`. Existing desktop markup, layout, and
interactions remain the source of truth at `768px` and above. New responsive
rules must be mobile-scoped rather than changing shared desktop defaults.

## Mobile shell

On mobile, `DashboardLayout` renders a compact header and a fixed bottom
navigation bar instead of the desktop sidebar. The navigation contains Home,
Orders, Inbox, Products, and More. More opens a sheet containing Customers,
Returns, Warehouses, AI tools, Settings, Billing, and Online Store.

The shell will account for device safe-area insets. Main content will receive
bottom padding so the fixed navigation never hides the last control or list
item. The current desktop sidebar and header remain unchanged on desktop.

## Workflow presentation

### Home and orders

Existing search, status filters, date controls, pagination, selection, and
actions remain available, but controls stack vertically on mobile. The desktop
order table is complemented by a mobile order-card presentation. Each card
shows order number/date, customer name and phone, product summary, total,
status, fraud signal, and the most relevant courier/status action. Bulk actions
move into a mobile action sheet.

### Order details and editing

The mobile editor is a single-column flow ordered as status and summary,
customer information, cart items, delivery/discount, notes, and save. Save
remains easy to reach after editing without relying on desktop columns.

### Social inboxes

Inbox pages use a mobile master-detail flow: conversation list first, then a
thread after tapping a conversation. A back control returns to the list. The
message composer remains accessible above the mobile navigation.

### Products and customers

Dense tables become tappable summary cards with search and filters near the
top. Edit, delete, stock, and other secondary actions move into per-card
overflow menus. Full editing remains on a dedicated single-column page.

## Interaction and accessibility requirements

- Preserve all existing API calls and mutation behavior.
- Use existing router navigation and `apiFetch()` conventions.
- Keep touch targets at least 44px where practical.
- Provide accessible labels for icon-only mobile controls and navigation.
- Respect reduced-motion preferences for any new transitions.
- Prevent horizontal page overflow; intentional horizontal scrolling is not the
  primary mobile solution for the covered workflows.

## Implementation boundaries

- Prefer mobile-specific presentation components where existing desktop
  components are structurally table- or grid-dependent.
- Reuse existing domain helpers, status labels, mutations, and data queries.
- Avoid backend, database, and API changes.
- Do not refactor unrelated desktop UI or alter desktop breakpoints/styles.

## Verification

- Add focused component tests for mobile navigation visibility/links and mobile
  order-card content/actions where practical.
- Run the existing test suite, lint, and production build.
- Verify the priority routes at phone widths including approximately 360px,
  390px, and 430px, checking for clipping, covered controls, inaccessible
  actions, and horizontal overflow.
