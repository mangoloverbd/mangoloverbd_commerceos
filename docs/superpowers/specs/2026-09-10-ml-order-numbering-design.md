# Mango Lover Order Numbering Design

**Date:** 2026-09-10

## Goal

All newly created Mango Lover BD orders use one canonical human-readable number sequence:
`ML-150000`, `ML-150001`, and onward. Existing order numbers remain unchanged.

The sequence applies to orders created through:

- Merchant Suite's manual order creator.
- The public storefront checkout.
- The landing-page checkout webhook.

Shopify import behavior is left unchanged. Mango Lover BD does not currently use Shopify.

## Current state

Merchant Suite currently shares an `app_settings` counter, but formats its output differently by
caller:

- Manual Suite orders use `#M<number>`.
- Landing-page webhook orders use `#<number>`.
- Direct storefront orders use `#S<number>`.

The counter currently uses a read-then-compare-and-update loop. It is shared, but two concurrent
requests can read the same value and both attempt to allocate the same next number. The live
workspace counter is `1073`; recent custom-store orders end at `#1073`.

## Approved architecture

### Database allocator

Add a canonical Postgres sequence owned by the Merchant Suite migration history. The first
allocation returns `150000`. Add a restricted RPC function that returns the formatted `ML-<number>`
value from `nextval`. A database sequence performs the increment atomically, so storefront,
landing-page, and dashboard requests cannot receive the same number under concurrent traffic.

Before enabling the allocator, initialize it to the greater of `150000` and any existing numeric
`ML-<number>` value. This preserves old rows and prevents a future migration or manual data change
from causing a collision.

Add a unique index on `(org_id, order_number)` after confirming the current data has no duplicates.
The index is defense in depth; allocation remains the primary source of numbers.

The allocator RPC is callable only by the service role. Public clients never receive database
access or the ability to choose an order number.

### Server integration

Replace the existing `getNextManualOrderSeq` implementation with a small helper that calls the
allocator RPC and returns the canonical string. The helper keeps the existing resolved workspace
argument and service-role client, so every order query and insert remains workspace-scoped.

Update all three current callers:

1. `/api/orders` ignores a client-provided `order_number` and allocates `ML-...` for manually
   created Suite orders.
2. `/api/custom-orders/webhook` ignores any incoming order identifier and allocates `ML-...` for
   landing-page orders.
3. `/api/public/v1/:handle/orders` allocates `ML-...` for direct storefront orders.

The existing order payloads, stock checks, warehouse routing, order-item writes, SMS behavior, and
response contracts remain unchanged except that returned and persisted order numbers use the new
format. Existing courier/invoice code consumes the stored value and does not require a separate
numbering path.

### Storefront integration

No client-side number generation is needed. The storefront server already forwards landing-page
orders to Merchant Suite and returns the canonical response. Existing confirmation pages already
render the returned `orderRef`, so they will display `ML-...` automatically.

The storefront's local fallback reference must not be presented as a successful canonical order
number when the Merchant Suite webhook fails. Strict campaign checkouts already reject upstream
failure; the default checkout's existing fallback behavior will be reviewed so the new requirement
does not create a misleading non-persisted `#<random>` reference.

## Error handling and concurrency

- A failed database allocation or order insert returns the existing server error response.
- Sequence gaps are acceptable when an allocation succeeds but a later insert fails. Numbers must
  be unique and increasing, not gapless.
- A duplicate order-number insert fails at the unique index rather than silently creating an
  ambiguous order.
- Client-supplied `order_number`, `order_id`, or similar values never override the allocator.

## Testing

### Merchant Suite

- Assert the allocator helper invokes the canonical RPC and returns `ML-150000`-style values.
- Assert manual and webhook order creation ignore supplied order numbers.
- Assert direct storefront order creation persists and returns the canonical number.
- Assert the migration creates the sequence, restricted function, and unique index.
- Run a concurrency test against the allocator contract to verify allocated values are distinct.

### Storefront

- Assert both local and Vercel order services still forward the same payload and return the
  canonical `order_id` as `orderRef`.
- Assert confirmation flows render the returned `ML-...` value without generating a local fallback
  on a successful response.
- Preserve existing validation, analytics, and upstream-failure tests.

## Rollout

1. Commit the migration and server changes in Merchant Suite.
2. Apply the migration to the Mango Lover BD Supabase project after reviewing its SQL and advisors.
3. Deploy Merchant Suite.
4. Deploy the storefront after confirming the shared API contract.
5. Place one test order through a landing page and one through the storefront, then verify both
   appear in the dashboard with unique `ML-...` numbers.
