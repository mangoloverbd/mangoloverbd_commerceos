-- Abandoned checkouts keep the shopper's website visit (the storefront's ms_sid
-- cookie, forwarded by its capture proxy) and when it was last captured, so an
-- order staff create from the checkout is linked to that visit. Unsigned
-- evidence, like order_protection_reviews.analytics_session_id: the order is
-- linked only if the visit exists in this workspace and was live at capture.
begin;

alter table public.abandoned_checkouts
  add column if not exists analytics_session_id uuid,
  add column if not exists analytics_captured_at timestamptz;

commit;
