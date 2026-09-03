begin;

create unique index if not exists orders_org_id_id_unique_idx
on public.orders (org_id, id);

create unique index if not exists products_org_id_id_unique_idx
on public.products (org_id, id);

create unique index if not exists product_variants_org_id_id_unique_idx
on public.product_variants (org_id, id);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_id uuid not null,
  product_id uuid,
  variant_id uuid,
  product_name text not null,
  variant_name text,
  unit_price numeric not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.order_items
  alter column unit_price type numeric using unit_price,
  drop constraint if exists order_items_order_workspace_fkey,
  drop constraint if exists order_items_product_workspace_fkey,
  drop constraint if exists order_items_variant_workspace_fkey;

alter table public.order_items
  add constraint order_items_order_workspace_fkey
    foreign key (org_id, order_id) references public.orders(org_id, id) on delete cascade,
  add constraint order_items_product_workspace_fkey
    foreign key (org_id, product_id) references public.products(org_id, id),
  add constraint order_items_variant_workspace_fkey
    foreign key (org_id, variant_id) references public.product_variants(org_id, id);

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

create or replace function public.clear_order_item_catalog_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_argv[0] = 'product_id' then
    update public.order_items
    set product_id = null
    where org_id = old.org_id and product_id = old.id;
  elsif tg_argv[0] = 'variant_id' then
    update public.order_items
    set variant_id = null
    where org_id = old.org_id and variant_id = old.id;
  end if;

  return old;
end;
$$;

drop trigger if exists clear_order_item_product_reference on public.products;
create trigger clear_order_item_product_reference
before delete on public.products
for each row execute function public.clear_order_item_catalog_reference('product_id');

drop trigger if exists clear_order_item_variant_reference on public.product_variants;
create trigger clear_order_item_variant_reference
before delete on public.product_variants
for each row execute function public.clear_order_item_catalog_reference('variant_id');

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
    part.part_no,
    trim(regexp_replace(
      part.value,
      '^[[:space:]]*(Cart Checkout[[:space:]]*-[[:space:]]*)?[0-9]+[[:space:]]*[xX][[:space:]]*',
      '',
      'i'
    )) as product_text
  from public.orders as o
  cross join lateral regexp_split_to_table(
    coalesce(nullif(trim(o.product), ''), ''),
    '\s*\+\s*'
  ) with ordinality as part(value, part_no)
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
), priced_parts as (
  select
    part.*,
    greatest(coalesce(part.price, 0), 0) / part.total_quantity as base_unit_price,
    coalesce(sum((greatest(coalesce(part.price, 0), 0) / part.total_quantity) * part.quantity) over (
      partition by part.order_id order by part.part_no
      rows between unbounded preceding and 1 preceding
    ), 0) as prior_total,
    max(part.part_no) over (partition by part.order_id) as last_part_no
  from matched_parts as part
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
  case when part_no = last_part_no
    then (greatest(coalesce(price, 0), 0) - prior_total) / quantity
    else base_unit_price
  end,
  quantity,
  now(),
  now()
from priced_parts;

alter table public.order_items enable row level security;
revoke all on public.order_items from anon, authenticated;
revoke execute on function public.validate_order_item_ownership() from public, anon, authenticated;
revoke execute on function public.clear_order_item_catalog_reference() from public, anon, authenticated;
grant all on public.order_items to service_role;
grant execute on function public.validate_order_item_ownership() to service_role;

notify pgrst, 'reload schema';

commit;
