-- Preserve the specific storefront landing page that originated an order.
-- The canonical order source remains `website`; this is separate attribution.
alter table public.orders
  add column if not exists landing_page_path text;
