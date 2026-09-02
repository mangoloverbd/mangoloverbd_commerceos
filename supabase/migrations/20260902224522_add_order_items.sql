begin;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  variant_name text,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_items_org_order_id_idx
on public.order_items (org_id, order_id);

create index if not exists order_items_org_product_id_idx
on public.order_items (org_id, product_id)
where product_id is not null;

create index if not exists order_items_org_variant_id_idx
on public.order_items (org_id, variant_id)
where variant_id is not null;

create or replace function public.validate_order_item_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.orders as o
    where o.id = new.order_id and o.org_id = new.org_id
  ) then
    raise exception 'order item order and workspace do not match';
  end if;

  if new.product_id is not null and not exists (
    select 1 from public.products as p
    where p.id = new.product_id and p.org_id = new.org_id
  ) then
    raise exception 'order item product and workspace do not match';
  end if;

  if new.variant_id is not null and not exists (
    select 1 from public.product_variants as v
    where v.id = new.variant_id and v.org_id = new.org_id
  ) then
    raise exception 'order item variant and workspace do not match';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_order_items_ownership on public.order_items;
create trigger validate_order_items_ownership
before insert or update on public.order_items
for each row execute function public.validate_order_item_ownership();

drop trigger if exists update_order_items_updated_at on public.order_items;
create trigger update_order_items_updated_at
before update on public.order_items
for each row execute function public.update_updated_at_column();

-- Split the legacy display text when possible, but retain every order as a
-- legacy item when no catalog product can be identified.
with order_parts as (
  select
    o.id as order_id,
    o.org_id,
    o.price,
    greatest(
      coalesce((regexp_match(part.value, '^[[:space:]]*(Cart Checkout[[:space:]]*-[[:space:]]*)?([0-9]+)[[:space:]]*[xX]'))[2]::integer, 1),
      1
    ) as quantity,
    trim(regexp_replace(
      part.value,
      '^[[:space:]]*(Cart Checkout[[:space:]]*-[[:space:]]*)?[0-9]+[[:space:]]*[xX][[:space:]]*',
      '',
      'i'
    )) as product_text
  from public.orders as o
  cross join lateral regexp_split_to_table(
    coalesce(nullif(trim(o.product), ''), ''),
    '\s+\+\s+'
  ) as part(value)
  where not exists (
    select 1 from public.order_items as existing
    where existing.order_id = o.id and existing.org_id = o.org_id
  )
), matched_parts as (
  select
    part.*,
    product.id as product_id,
    product.name as catalog_product_name,
    sum(part.quantity) over (partition by part.order_id) as total_quantity
  from order_parts as part
  left join lateral (
    select p.id, p.name
    from public.products as p
    where p.org_id = part.org_id
      and lower(part.product_text) like '%' || lower(p.name) || '%'
    order by length(p.name) desc
    limit 1
  ) as product on true
)
insert into public.order_items (
  org_id,
  order_id,
  product_id,
  product_name,
  variant_name,
  unit_price,
  quantity,
  created_at,
  updated_at
)
select
  org_id,
  order_id,
  product_id,
  coalesce(nullif(catalog_product_name, ''), nullif(product_text, ''), 'Legacy product'),
  null,
  round(greatest(coalesce(price, 0), 0) / greatest(total_quantity, 1), 2),
  quantity,
  now(),
  now()
from matched_parts;

alter table public.order_items enable row level security;
revoke all on public.order_items from anon, authenticated;
revoke execute on function public.validate_order_item_ownership() from public, anon, authenticated;
grant all on public.order_items to service_role;
grant execute on function public.validate_order_item_ownership() to service_role;

notify pgrst, 'reload schema';

commit;
