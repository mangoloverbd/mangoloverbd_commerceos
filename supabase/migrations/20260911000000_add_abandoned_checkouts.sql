-- Durable, manual-only checkout recovery. Drafts are deliberately separate
-- from orders so they never participate in fulfillment, inventory, revenue,
-- or automated customer outreach.

begin;

create table if not exists public.abandoned_checkouts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  draft_key uuid not null,
  status text not null default 'open' check (status in ('open', 'contacted', 'dismissed', 'recovered', 'expired')),
  customer_name text,
  phone text check (phone is null or phone ~ '^01[0-9]{9}$'),
  address text,
  cart jsonb not null default '[]'::jsonb check (jsonb_typeof(cart) = 'array'),
  subtotal numeric(12, 2) check (subtotal is null or subtotal >= 0),
  delivery_rate numeric(12, 2) check (delivery_rate is null or delivery_rate >= 0),
  total numeric(12, 2) check (total is null or total >= 0),
  source text not null,
  source_path text not null,
  campaign jsonb not null default '{}'::jsonb check (jsonb_typeof(campaign) = 'object'),
  contacted_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, draft_key),
  unique (id, org_id),
  check (
    (source = 'storefront' and source_path = '/checkout')
    or (source = 'sundarbans_honey' and source_path = '/step/sundarbans-natural-honey')
    or (source = 'kalojira_mixed' and source_path = '/step/kalojira-mixed')
    or (source = 'honey_nut' and source_path = '/step/honey-nut')
  ),
  check (expires_at > created_at)
);

create index if not exists abandoned_checkouts_org_status_expires_idx
on public.abandoned_checkouts (org_id, status, expires_at, created_at desc)
where status in ('open', 'contacted');

create index if not exists abandoned_checkouts_org_created_idx
on public.abandoned_checkouts (org_id, created_at desc);

create or replace function public.abandoned_checkout_preserve_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.expires_at is distinct from old.expires_at then
    raise exception 'abandoned checkout expiry is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.abandoned_checkout_preserve_expiry() from public, anon, authenticated;
grant execute on function public.abandoned_checkout_preserve_expiry() to service_role;

drop trigger if exists preserve_abandoned_checkout_expiry on public.abandoned_checkouts;
create trigger preserve_abandoned_checkout_expiry
before update on public.abandoned_checkouts
for each row execute function public.abandoned_checkout_preserve_expiry();

drop trigger if exists update_abandoned_checkouts_updated_at on public.abandoned_checkouts;
create trigger update_abandoned_checkouts_updated_at
before update on public.abandoned_checkouts
for each row execute function public.update_updated_at_column();

alter table public.orders
  add column if not exists abandoned_checkout_id uuid,
  add column if not exists abandoned_draft_key_hash text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_abandoned_checkout_org_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_abandoned_checkout_org_fkey
      foreign key (abandoned_checkout_id, org_id)
      references public.abandoned_checkouts (id, org_id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists orders_org_abandoned_checkout_id_idx
on public.orders (org_id, abandoned_checkout_id)
where abandoned_checkout_id is not null;

create index if not exists orders_org_abandoned_draft_key_hash_idx
on public.orders (org_id, abandoned_draft_key_hash)
where abandoned_draft_key_hash is not null;

create or replace function public.reconcile_abandoned_checkouts(p_org_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  recovered_count integer;
begin
  with hash_matches as materialized (
    select distinct on (ac.id)
      ac.id as checkout_id,
      o.id as order_id
    from public.abandoned_checkouts as ac
    join public.orders as o
      on o.org_id = ac.org_id
      and o.abandoned_draft_key_hash = encode(extensions.digest(ac.draft_key::text, 'sha256'), 'hex')
    where ac.org_id = p_org_id
      and ac.status in ('open', 'contacted')
      and ac.expires_at > now()
      and (o.abandoned_checkout_id is null or o.abandoned_checkout_id = ac.id)
    order by ac.id, o.created_at asc
  ),
  link_hash_matches as (
    update public.orders as o
    set abandoned_checkout_id = m.checkout_id
    from hash_matches as m
    where o.id = m.order_id
      and o.org_id = p_org_id
      and o.abandoned_checkout_id is null
    returning o.abandoned_checkout_id
  ),
  linked_orders as (
    select o.abandoned_checkout_id as checkout_id
    from public.orders as o
    where o.org_id = p_org_id
      and o.abandoned_checkout_id is not null
  ),
  resolved_checkout_ids as (
    select checkout_id from linked_orders
    union
    select checkout_id from hash_matches
  ),
  resolved as (
    update public.abandoned_checkouts as ac
    set
      status = 'recovered',
      resolved_at = now(),
      resolution = 'ordered'
    from resolved_checkout_ids as resolved_id
    where ac.id = resolved_id.checkout_id
      and ac.org_id = p_org_id
      and ac.status in ('open', 'contacted')
      and ac.expires_at > now()
    returning ac.id
  )
  select count(*) into recovered_count from resolved;

  return recovered_count;
end;
$$;

revoke all on function public.reconcile_abandoned_checkouts(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_abandoned_checkouts(uuid) to service_role;

alter table public.abandoned_checkouts enable row level security;
revoke all on public.abandoned_checkouts from anon, authenticated;
grant all on public.abandoned_checkouts to service_role;

notify pgrst, 'reload schema';

commit;
