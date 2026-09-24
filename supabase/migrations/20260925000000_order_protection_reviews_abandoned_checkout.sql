-- A held storefront order never becomes an order at checkout, so the normal
-- "order placed → abandoned checkout recovered" handoff never runs and the
-- checkout stayed in the Abandoned tab after staff approved or rejected the
-- hold. Link each held review to the shopper's abandoned checkout so approve
-- can mark it recovered and reject can dismiss it.
begin;

alter table public.order_protection_reviews
  add column if not exists abandoned_checkout_id uuid null
    references public.abandoned_checkouts(id) on delete set null;

create index if not exists order_protection_reviews_abandoned_checkout_idx
  on public.order_protection_reviews (org_id, abandoned_checkout_id)
  where abandoned_checkout_id is not null;

commit;
