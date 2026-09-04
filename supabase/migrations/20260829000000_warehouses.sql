-- Warehouses are org-scoped routing labels, not inventory locations. Stock
-- remains one number per product or variant.

begin;

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  address text,
  contact_person text,
  phone text,
  is_default boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);

create unique index warehouses_org_name_idx
on public.warehouses (org_id, name)
where deleted_at is null;

create unique index warehouses_org_default_idx
on public.warehouses (org_id)
where is_default and deleted_at is null;

create index warehouses_org_listing_idx
on public.warehouses (org_id, deleted_at, created_at desc);

drop trigger if exists update_warehouses_updated_at on public.warehouses;
create trigger update_warehouses_updated_at
before update on public.warehouses
for each row execute function public.update_updated_at_column();

alter table public.products add column warehouse_id uuid;
alter table public.products add column weight_kg numeric(10, 3)
  check (weight_kg is null or weight_kg >= 0);
alter table public.products
  add constraint products_org_warehouse_id_fkey
  foreign key (org_id, warehouse_id)
  references public.warehouses (org_id, id);

alter table public.product_variants add column weight_kg numeric(10, 3)
  check (weight_kg is null or weight_kg >= 0);

alter table public.orders add column warehouse_id uuid;
alter table public.orders add column warehouse_auto boolean not null default true;
alter table public.orders add column weight_kg numeric(10, 3)
  check (weight_kg is null or weight_kg >= 0);
alter table public.orders
  add constraint orders_org_warehouse_id_fkey
  foreign key (org_id, warehouse_id)
  references public.warehouses (org_id, id);

alter table public.social_inbox_orders add column warehouse_id uuid;
alter table public.social_inbox_orders add column warehouse_auto boolean not null default true;
alter table public.social_inbox_orders add column weight_kg numeric(10, 3)
  check (weight_kg is null or weight_kg >= 0);
alter table public.social_inbox_orders
  add constraint social_inbox_orders_org_warehouse_id_fkey
  foreign key (org_id, warehouse_id)
  references public.warehouses (org_id, id);

create index products_org_warehouse_idx on public.products (org_id, warehouse_id);
create index orders_org_warehouse_created_idx
on public.orders (org_id, warehouse_id, created_at desc);
create index social_inbox_orders_org_warehouse_idx
on public.social_inbox_orders (org_id, warehouse_id, created_at desc);

-- Ensure every existing workspace has an active Mango Lover warehouse before
-- choosing one default. The two-step repair avoids transient partial-index
-- conflicts when an existing default is replaced.
insert into public.warehouses (org_id, name, is_default)
select orgs.org_id, 'Mango Lover', false
from (
  select distinct org_id
  from public.user_roles
  where org_id is not null
) as orgs
where not exists (
  select 1
  from public.warehouses as warehouse
  where warehouse.org_id = orgs.org_id
    and warehouse.name = 'Mango Lover'
    and warehouse.deleted_at is null
);

update public.warehouses as warehouse
set is_default = false
where warehouse.org_id in (
  select distinct org_id
  from public.user_roles
  where org_id is not null
)
  and warehouse.is_default;

with ranked_warehouses as (
  select
    warehouse.org_id,
    warehouse.id,
    row_number() over (
      partition by warehouse.org_id
      order by
        case when warehouse.name = 'Mango Lover' then 0 else 1 end,
        warehouse.created_at,
        warehouse.id
    ) as default_rank
  from public.warehouses as warehouse
  inner join (
    select distinct org_id
    from public.user_roles
    where org_id is not null
  ) as orgs on orgs.org_id = warehouse.org_id
  where warehouse.deleted_at is null
)
update public.warehouses as warehouse
set is_default = true
from ranked_warehouses
where warehouse.org_id = ranked_warehouses.org_id
  and warehouse.id = ranked_warehouses.id
  and ranked_warehouses.default_rank = 1;

create function public.set_default_warehouse(p_org_id uuid, p_warehouse_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_warehouse_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_org_id::text, 0)
  );

  -- Lock every warehouse for the workspace so clear-and-set is atomic.
  perform 1
  from public.warehouses as warehouse
  where warehouse.org_id = p_org_id
  order by warehouse.id
  for update;

  select warehouse.id
  into v_warehouse_id
  from public.warehouses as warehouse
  where warehouse.org_id = p_org_id
    and warehouse.id = p_warehouse_id
    and warehouse.deleted_at is null
  for update;

  if v_warehouse_id is null then
    raise exception 'Warehouse % is not active in workspace %', p_warehouse_id, p_org_id
      using errcode = 'P0002';
  end if;

  update public.warehouses as warehouse
  set is_default = false
  where warehouse.org_id = p_org_id
    and warehouse.is_default
    and warehouse.id <> p_warehouse_id;

  update public.warehouses as warehouse
  set is_default = true
  where warehouse.org_id = p_org_id
    and warehouse.id = p_warehouse_id
    and warehouse.deleted_at is null;
end;
$$;

create function public.create_warehouse(
  p_org_id uuid,
  p_name text,
  p_address text,
  p_contact_person text,
  p_phone text,
  p_is_default boolean
)
returns public.warehouses
language plpgsql
set search_path = ''
as $$
declare
  v_is_default boolean;
  v_warehouse public.warehouses;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_org_id::text, 0)
  );

  v_is_default := p_is_default or not exists (
    select 1
    from public.warehouses as warehouse
    where warehouse.org_id = p_org_id
      and warehouse.is_default
      and warehouse.deleted_at is null
  );

  if v_is_default then
    update public.warehouses as warehouse
    set is_default = false
    where warehouse.org_id = p_org_id
      and warehouse.is_default
      and warehouse.deleted_at is null;
  end if;

  insert into public.warehouses (
    org_id,
    name,
    address,
    contact_person,
    phone,
    is_default
  )
  values (
    p_org_id,
    p_name,
    p_address,
    p_contact_person,
    p_phone,
    v_is_default
  )
  returning * into v_warehouse;

  return v_warehouse;
end;
$$;

create function public.update_warehouse(
  p_org_id uuid,
  p_warehouse_id uuid,
  p_name text,
  p_address text,
  p_contact_person text,
  p_phone text,
  p_is_default boolean
)
returns public.warehouses
language plpgsql
set search_path = ''
as $$
declare
  v_existing public.warehouses;
  v_is_default boolean;
  v_warehouse public.warehouses;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_org_id::text, 0)
  );

  select warehouse.*
  into v_existing
  from public.warehouses as warehouse
  where warehouse.org_id = p_org_id
    and warehouse.id = p_warehouse_id
    and warehouse.deleted_at is null
  for update;

  if not found then
    raise exception 'Warehouse % is not active in workspace %', p_warehouse_id, p_org_id
      using errcode = 'P0002';
  end if;

  v_is_default := v_existing.is_default or p_is_default;
  if v_is_default then
    update public.warehouses as warehouse
    set is_default = false
    where warehouse.org_id = p_org_id
      and warehouse.id <> p_warehouse_id
      and warehouse.is_default
      and warehouse.deleted_at is null;
  end if;

  update public.warehouses as warehouse
  set
    name = p_name,
    address = p_address,
    contact_person = p_contact_person,
    phone = p_phone,
    is_default = v_is_default
  where warehouse.org_id = p_org_id
    and warehouse.id = p_warehouse_id
    and warehouse.deleted_at is null
  returning * into v_warehouse;

  return v_warehouse;
end;
$$;

create function public.delete_warehouse(p_org_id uuid, p_warehouse_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_is_default boolean;
  v_unassigned integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_org_id::text, 0)
  );

  select warehouse.is_default
  into v_is_default
  from public.warehouses as warehouse
  where warehouse.org_id = p_org_id
    and warehouse.id = p_warehouse_id
    and warehouse.deleted_at is null
  for update;

  if not found then
    raise exception 'Warehouse % is not active in workspace %', p_warehouse_id, p_org_id
      using errcode = 'P0002';
  end if;
  if v_is_default then
    raise exception 'Cannot delete the default warehouse'
      using errcode = '23514';
  end if;

  update public.products as product
  set warehouse_id = null
  where product.org_id = p_org_id
    and product.warehouse_id = p_warehouse_id;
  get diagnostics v_unassigned = row_count;

  update public.warehouses as warehouse
  set deleted_at = pg_catalog.now()
  where warehouse.org_id = p_org_id
    and warehouse.id = p_warehouse_id
    and not warehouse.is_default
    and warehouse.deleted_at is null;

  return v_unassigned;
end;
$$;

create function public.bulk_assign_products_to_warehouse(
  p_org_id uuid,
  p_product_ids uuid[],
  p_warehouse_id uuid
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_requested_count integer;
  v_product_count integer;
begin
  if p_product_ids is null or pg_catalog.cardinality(p_product_ids) = 0 then
    raise exception 'At least one product ID is required' using errcode = '22023';
  end if;

  select pg_catalog.count(distinct product_id)
  into v_requested_count
  from pg_catalog.unnest(p_product_ids) as requested(product_id)
  where product_id is not null;

  if v_requested_count <> pg_catalog.cardinality(p_product_ids) then
    raise exception 'Product IDs must be unique, non-null values' using errcode = '22023';
  end if;

  if p_warehouse_id is not null and not exists (
    select 1
    from public.warehouses as warehouse
    where warehouse.org_id = p_org_id
      and warehouse.id = p_warehouse_id
      and warehouse.deleted_at is null
  ) then
    raise exception 'Warehouse % is not active in workspace %', p_warehouse_id, p_org_id
      using errcode = 'P0002';
  end if;

  select pg_catalog.count(*)
  into v_product_count
  from public.products as product
  where product.org_id = p_org_id
    and product.id = any(p_product_ids);

  if v_product_count <> v_requested_count then
    raise exception 'One or more products are missing from workspace %', p_org_id
      using errcode = 'P0002';
  end if;

  update public.products as product
  set warehouse_id = p_warehouse_id
  where product.org_id = p_org_id
    and product.id = any(p_product_ids);

  return v_product_count;
end;
$$;

alter table public.warehouses enable row level security;
revoke all on table public.warehouses from public, anon, authenticated;
grant all on table public.warehouses to service_role;

revoke all on function public.set_default_warehouse(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.set_default_warehouse(uuid, uuid) to service_role;

revoke all on function public.create_warehouse(uuid, text, text, text, text, boolean)
from public, anon, authenticated;
grant execute on function public.create_warehouse(uuid, text, text, text, text, boolean) to service_role;

revoke all on function public.update_warehouse(uuid, uuid, text, text, text, text, boolean)
from public, anon, authenticated;
grant execute on function public.update_warehouse(uuid, uuid, text, text, text, text, boolean) to service_role;

revoke all on function public.delete_warehouse(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.delete_warehouse(uuid, uuid) to service_role;

revoke all on function public.bulk_assign_products_to_warehouse(uuid, uuid[], uuid)
from public, anon, authenticated;
grant execute on function public.bulk_assign_products_to_warehouse(uuid, uuid[], uuid) to service_role;

notify pgrst, 'reload schema';

commit;
