-- Let a variant be sold from Merchant-Suite (manual, inbox and courier flows)
-- while staying off the public storefront catalog, inventory and checkout.
-- Existing variants keep their current behavior through the true default.
begin;
alter table public.product_variants
  add column storefront_visible boolean not null default true;
comment on column public.product_variants.storefront_visible is
  'When false the variant is Merchant-Suite only: omitted from the public storefront API and rejected by public checkout.';
commit;
