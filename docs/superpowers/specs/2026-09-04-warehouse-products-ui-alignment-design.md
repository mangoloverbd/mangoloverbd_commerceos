# Warehouse Products-Style UI Alignment

**Date:** 2026-09-04
**Status:** Approved direction, pending written-spec review

## Goal

Make warehouse management feel native to Merchant-Suite by aligning it with the existing Products page. The warehouse screens must use the same page shell, visual hierarchy, compact controls, responsive behavior, and operational feedback as Products while preserving all existing warehouse behavior.

## Visual Direction

Products is the primary reference. Customers supplies the established overlay treatment, and Inbox Orders supplies patterns for dense operational rows and action feedback where Products has no equivalent.

The warehouse list uses the Products page shell: `min-h-full`, white background, `p-1 lg:p-2`, and compact vertical spacing. It uses the existing system font treatment, rounded secondary surfaces, quiet separators, compact labels, and black primary actions. It must not introduce new color tokens, shadows, fonts, or icon libraries.

## Warehouse List

The page contains:

1. A Products-style summary row showing total warehouses, assigned products, default warehouse, and warehouses with contact information.
2. A compact table toolbar containing the section icon, “Warehouses” title, count badge, search input, and a `RichButton` for creating a warehouse.
3. A responsive table with Name, Contact, Products, Status, and Actions columns.

Each row shows a compact warehouse icon, warehouse name, address preview, contact name and phone, product count, and a restrained Default or Active status pill. Clicking the non-action area opens warehouse detail. Edit and delete actions stop row navigation. The default warehouse cannot be deleted and its delete control must communicate that state.

Search filters by warehouse name, address, contact person, and phone. An empty repository and a search with no matches have distinct, styled empty states.

## Warehouse Detail

The detail page uses the same shell and starts with a compact back control, warehouse identity, status, contact metadata, and an edit action. Three Products-style metric cards show products assigned, units in stock, and published products.

The products section uses the Products table language rather than stacked plain rows. It includes product name, assignment source, weight, stock, publication state, and removal action. Default-warehouse fallback products are visually distinguished from explicit assignments; only explicit assignments may be removed from the current warehouse.

The orders section embeds the existing `OrdersTable` without recreating it. Loading, error, and missing-warehouse states use the same centered feedback treatment as the other operational pages.

## Warehouse Dialog

Create and edit share `WarehouseDialog`. The overlay follows the existing customer profile treatment: blurred translucent backdrop, warm `#FAFAF8` panel, Framer Motion entrance/exit, reduced-motion support, Escape close, and outside-pointer close.

Fields use existing project inputs and controls for name, address, contact person, phone, and default status. The footer uses the established secondary Cancel button and primary save button with spinner. Validation and API failures use the shared toast system. Saving preserves the form until the request succeeds.

## Components and Data Flow

- `useWarehouses` remains the shared list query.
- `Warehouses` owns search, dialog selection, deletion, and navigation.
- `WarehouseDetail` owns detail/orders queries and product assignment mutations.
- `WarehouseDialog` owns form state and POST/PATCH submission.
- Successful mutations invalidate the warehouse list and relevant detail queries.
- All API access continues through `apiFetch`; no organization identifier is accepted from the client.

## Accessibility and Responsive Behavior

- Buttons and icon-only actions have accessible names.
- Rows support keyboard navigation without hijacking interactive child controls.
- Dialog focus starts in the name field and closes with Escape.
- Tables remain horizontally scrollable on narrow screens; summary cards collapse from four columns to one or two.
- Motion respects `useReducedMotion`.
- Status is conveyed with text as well as color.

## Testing

Component tests cover list rendering, search, create/edit opening, protected default deletion, row navigation, and API mutation feedback. Detail tests cover metrics, fallback labeling, explicit removal, and embedded `OrdersTable`. Dialog tests cover create/edit payloads, validation, close behavior, and loading state. The production build and lint suite must pass after the refactor.

## Out of Scope

- Warehouse API or schema redesign
- Inventory transfer workflows
- New warehouse analytics
- Changes to Products, Customers, or Inbox Orders styling
- Storefront changes
