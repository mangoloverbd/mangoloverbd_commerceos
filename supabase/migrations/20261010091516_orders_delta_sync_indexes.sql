-- The dashboard polls GET /api/orders?changed_since every minute per open tab.
-- Both delta reads filter on (org_id, updated_at); without these indexes each
-- poll scanned every order and order item. Additive and data-preserving.
begin;

create index if not exists orders_org_updated_at_idx
  on public.orders (org_id, updated_at);

create index if not exists order_items_org_updated_at_idx
  on public.order_items (org_id, updated_at);

commit;
