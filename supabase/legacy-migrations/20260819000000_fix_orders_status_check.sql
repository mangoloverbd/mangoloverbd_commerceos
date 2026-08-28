-- The orders.status column is app-managed free text. The previous check
-- constraint only allowed ('pending','confirmed'), which silently rejected
-- every other status the app uses (cancelled, delivered, returned, processing,
-- partial_delivered, rejected, fulfilled). That caused AI mutations and manual
-- dashboard status changes to fail with a swallowed constraint violation.
-- Replace it with the full set of statuses the application actually uses.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending',
    'confirmed',
    'cancelled',
    'delivered',
    'returned',
    'processing',
    'partial_delivered',
    'rejected',
    'fulfilled'
  ]::text[]));
