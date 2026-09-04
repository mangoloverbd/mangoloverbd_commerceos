# Warehouse Detail — Add Products Picker Design

**Date:** 2026-09-04
**Status:** Approved
**Context:** The default "Mango Lover" warehouse lists all 4 catalog products as
"Default fallback" (`warehouse_id IS NULL`) with a "Managed by default" label and
no Remove action. Product assignment currently only exists on the Products page
(bulk select → Assign warehouse dropdown). This spec adds assignment directly on
the warehouse detail page.

## Goal

Let merchants add products to a warehouse from the warehouse detail page via a
searchable multi-select dialog, reusing the existing bulk-assign API. No API or
schema changes.

## Non-goals

- No changes to warehouse CRUD, removal semantics, orders routing, analytics,
  storefront, or reference-page styling.
- No change to the "Default fallback / Managed by default" display for
  unassigned products in the default warehouse.

## Design (Approach A — new dialog component)

### UI

- New `RichButton` labelled "Add products" (Plus icon, `@phosphor-icons/react`,
  `weight="light"`) in the "Inventory at this warehouse" section header, next to
  the count pill in `src/pages/WarehouseDetail.tsx`.
- New `src/components/warehouse/AddProductsDialog.tsx` with props
  `{ open, warehouseId, warehouseName, assignedProductIds, onClose, onAssigned }`:
  - Overlay/backdrop, panel shape, focus management, Escape and outside-pointer
    close, and autofocus follow the existing `WarehouseDialog` customer-overlay
    pattern (`fixed inset-0 z-40 grid place-items-center bg-black/12 px-4
    backdrop-blur-[3px]`, `max-w-lg rounded-[24px] bg-[#FAFAF8]`).
  - Search input filters eligible products by name (case-insensitive).
  - Checkbox rows show product name plus price (`৳`) and stock summary.
  - Footer shows selection count and an "Assign N products" button, disabled
    while the request is pending or nothing is selected.
  - Empty eligible list → "All products are already assigned here."
  - Loading → `Spinner`; fetch failure → error text with retry.

### Data flow

1. On open, the dialog fetches `GET /api/products` once via `apiFetch()`.
2. Eligible products = response `products` where `warehouse_id !== warehouseId`.
3. On assign: `POST /api/products/bulk-assign-warehouse` with
   `{ product_ids: <selected ids>, warehouse_id: <current warehouse id> }`.
4. On success: toast success, call `onAssigned` (parent runs `detail.refetch()`),
   close the dialog.
5. On failure: toast the API error text; keep the dialog open with the selection
   preserved.

### Edge cases

- Assigning products to the default warehouse flips them from "Default fallback"
  to "Direct assignment", which is what enables the existing Remove action.
- Remove behavior is unchanged and stays limited to explicitly assigned rows.
- Never send or accept an organization identifier; the server-side workspace
  guard is unchanged.
- Respect `useReducedMotion`; keep keyboard and narrow-screen access.

## Visual/UX constraints

- System font stack already used on the detail page; `#FAFAF8` panel.
- Phosphor icons with `weight="light"`; no new fonts, shadows, or tokens.

## Testing

- Extend `src/test/warehouseDetailPage.test.tsx`:
  - Picker lists only products not explicitly assigned to this warehouse.
  - Search filters the picker list.
  - Assign submits `{ product_ids, warehouse_id }` to
    `/api/products/bulk-assign-warehouse`, toasts, refetches, and closes.
  - API failure keeps the dialog open and surfaces the error.
- Regression: full warehouse + product-adjacent suites, `npm run lint`,
  `npm run build`.
