create sequence if not exists public.orders_order_number_seq
  as bigint
  start with 150000
  increment by 1
  minvalue 1
  no maxvalue
  cache 1;

select setval(
  'public.orders_order_number_seq',
  greatest(
    150000,
    coalesce(
      (
        select max((substring(order_number from '^ML-([0-9]+)$'))::bigint)
        from public.orders
        where order_number ~ '^ML-[0-9]+$'
      ),
      150000
    )
  ),
  case
    when coalesce(
      (
        select max((substring(order_number from '^ML-([0-9]+)$'))::bigint)
        from public.orders
        where order_number ~ '^ML-[0-9]+$'
      ),
      0
    ) >= 150000 then true
    else false
  end
);

create or replace function public.next_ml_order_number()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'ML-' || nextval('public.orders_order_number_seq')::text;
$$;

revoke all on function public.next_ml_order_number() from public;
grant execute on function public.next_ml_order_number() to service_role;
grant usage, select on sequence public.orders_order_number_seq to service_role;

create unique index if not exists orders_org_order_number_unique_idx
  on public.orders (org_id, order_number);
