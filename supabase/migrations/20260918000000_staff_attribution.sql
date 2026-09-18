-- Staff attribution for the Telesales / User Performance report.
--
-- Every attribution field is nullable and deliberately left blank for existing
-- orders. The event log preserves transition history that the latest-value
-- columns cannot represent.

begin;

alter table public.orders
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists assigned_to uuid references auth.users(id),
  add column if not exists confirmed_by uuid references auth.users(id),
  add column if not exists confirmed_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancelled_at timestamptz;

alter table public.social_inbox_orders
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists assigned_to uuid references auth.users(id),
  add column if not exists confirmed_by uuid references auth.users(id),
  add column if not exists confirmed_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancelled_at timestamptz;

-- Phase 2 filters report rows by workspace, staff member, then timestamp.
create index if not exists orders_org_confirmed_by_idx
  on public.orders (org_id, confirmed_by, confirmed_at desc)
  where confirmed_by is not null;

create index if not exists orders_org_assigned_to_idx
  on public.orders (org_id, assigned_to, created_at desc)
  where assigned_to is not null;

create index if not exists social_inbox_orders_org_confirmed_by_idx
  on public.social_inbox_orders (org_id, confirmed_by, confirmed_at desc)
  where confirmed_by is not null;

create index if not exists social_inbox_orders_org_assigned_to_idx
  on public.social_inbox_orders (org_id, assigned_to, created_at desc)
  where assigned_to is not null;

create index if not exists orders_org_cancelled_by_idx
  on public.orders (org_id, cancelled_by, cancelled_at desc)
  where cancelled_by is not null;

create index if not exists social_inbox_orders_org_cancelled_by_idx
  on public.social_inbox_orders (org_id, cancelled_by, cancelled_at desc)
  where cancelled_by is not null;

-- Foreign keys are not indexed automatically. These narrow partial indexes
-- keep Auth user deletion checks from scanning every order table.
create index if not exists orders_created_by_idx
  on public.orders (created_by)
  where created_by is not null;

create index if not exists orders_assigned_to_idx
  on public.orders (assigned_to)
  where assigned_to is not null;

create index if not exists orders_confirmed_by_idx
  on public.orders (confirmed_by)
  where confirmed_by is not null;

create index if not exists orders_cancelled_by_idx
  on public.orders (cancelled_by)
  where cancelled_by is not null;

create index if not exists social_inbox_orders_created_by_idx
  on public.social_inbox_orders (created_by)
  where created_by is not null;

create index if not exists social_inbox_orders_assigned_to_idx
  on public.social_inbox_orders (assigned_to)
  where assigned_to is not null;

create index if not exists social_inbox_orders_confirmed_by_idx
  on public.social_inbox_orders (confirmed_by)
  where confirmed_by is not null;

create index if not exists social_inbox_orders_cancelled_by_idx
  on public.social_inbox_orders (cancelled_by)
  where cancelled_by is not null;

-- Append-only status transition history. order_id cannot have a foreign key:
-- it refers to one of two order tables, selected by order_table.
create table if not exists public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_id uuid not null,
  order_table text not null check (order_table in ('orders', 'social_inbox_orders')),
  from_status text,
  to_status text not null,
  actor_id uuid references auth.users(id),
  actor_kind text not null check (actor_kind in ('user', 'courier_webhook', 'system')),
  created_at timestamptz not null default now()
);

create index if not exists order_status_events_org_order_idx
  on public.order_status_events (org_id, order_table, order_id, created_at desc);

create index if not exists order_status_events_org_actor_idx
  on public.order_status_events (org_id, actor_id, created_at desc)
  where actor_id is not null;

create index if not exists order_status_events_actor_id_idx
  on public.order_status_events (actor_id)
  where actor_id is not null;

alter table public.order_status_events enable row level security;
revoke all on table public.order_status_events from public;
revoke all on table public.order_status_events from anon, authenticated;
grant all on public.order_status_events to service_role;

-- Retain a former staff member's display name for historical attribution while
-- allowing active-role lookups to exclude their archived membership.
alter table public.user_roles
  add column if not exists deleted_at timestamptz;

create index if not exists user_roles_active_org_idx
  on public.user_roles (org_id, created_at)
  where deleted_at is null;

alter table public.user_roles
  add column if not exists display_name text;

commit;
