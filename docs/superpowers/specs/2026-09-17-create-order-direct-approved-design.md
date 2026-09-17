# Manual Create Order Direct-to-Approved Design

**Status:** Approved by user (2026-09-17)

## Goal

Orders created through the dashboard's manual Create Order page (`/orders/new`) land directly in the Approved tab instead of Pending. Staff verify name/phone/address while typing, so a Pending review step adds nothing for these orders.

## Scope

- Manual Create Order page only. Shopify sync, storefront checkouts, inbox orders, and all other sources still start at Pending.
- No server change: `POST /api/orders` already allowlists client-supplied `status`.

## Change

- `src/pages/NewOrder.tsx`: POST body `status: "pending"` → `status: "confirmed"` (the business status classified into the Approved filter — same id the Update Status menu uses for "Approved").

## Unchanged

- Pending tab still collects Shopify/storefront/inbox orders.
- Approved→Print→courier flow untouched (Print entry still Approved-only, manual).
- Fraud check remains available from Approved (bulk action bar + per-row).
- No migration: `orders.status` is free text.

## Testing

- Extend `src/test/orderCreatorModal.test.ts` submit test to assert the POST body contains `{ status: "confirmed" }`.
- Assert via `classifyOrderStatus` that a `confirmed` order lands in the `approved` filter.
- Full Vitest suite, lint, production build before completion.

## Non-goals

- No change to any other order source or the server default (`pending`).
- No auto-move to Print on creation.
