-- Detailed, append-only order audit trail. Existing order_status_events remain
-- the compatibility source for Staff Performance and pre-rollout status history.

begin;

create table if not exists public.order_activity_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_id uuid not null,
  order_table text not null check (order_table in ('orders', 'social_inbox_orders', 'abandoned_checkouts')),
  event_type text not null,
  category text not null check (category in ('lifecycle', 'view', 'edit', 'status', 'assignment', 'communication', 'fraud', 'courier', 'document')),
  actor_id uuid,
  actor_kind text not null check (actor_kind in ('user', 'customer', 'integration', 'courier_webhook', 'system')),
  actor_display_name text,
  group_id uuid,
  source_surface text not null,
  summary text not null,
  reason_code text,
  reason_note text,
  changes jsonb not null default '[]'::jsonb check (jsonb_typeof(changes) = 'array'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  request_id text,
  view_bucket timestamptz,
  created_at timestamptz not null default now(),
  check ((event_type = 'order.viewed' and view_bucket is not null) or (event_type <> 'order.viewed' and view_bucket is null)),
  check ((actor_kind = 'user' and actor_id is not null) or actor_kind <> 'user')
);

create index if not exists order_activity_events_org_order_idx
  on public.order_activity_events (org_id, order_table, order_id, created_at desc);

create index if not exists order_activity_events_org_actor_idx
  on public.order_activity_events (org_id, actor_id, created_at desc)
  where actor_id is not null;

create index if not exists order_activity_events_org_type_idx
  on public.order_activity_events (org_id, event_type, created_at desc);

create unique index if not exists order_activity_events_org_request_uidx
  on public.order_activity_events (org_id, request_id)
  where request_id is not null;

create unique index if not exists order_activity_events_meaningful_view_uidx
  on public.order_activity_events (org_id, order_table, order_id, actor_id, view_bucket)
  where event_type = 'order.viewed' and actor_id is not null and view_bucket is not null;

alter table public.order_activity_events enable row level security;
revoke all on table public.order_activity_events from public, anon, authenticated;
revoke all on table public.order_activity_events from service_role;
grant select, insert on table public.order_activity_events to service_role;

alter table public.orders
  add column if not exists origin_source text,
  add column if not exists origin_actor_kind text check (origin_actor_kind is null or origin_actor_kind in ('user', 'customer', 'integration', 'system')),
  add column if not exists detailed_activity_started_at timestamptz,
  add column if not exists cancellation_reason_code text,
  add column if not exists cancellation_reason_note text;

alter table public.social_inbox_orders
  add column if not exists origin_source text,
  add column if not exists origin_actor_kind text check (origin_actor_kind is null or origin_actor_kind in ('user', 'customer', 'integration', 'system')),
  add column if not exists detailed_activity_started_at timestamptz,
  add column if not exists cancellation_reason_code text,
  add column if not exists cancellation_reason_note text;

alter table public.abandoned_checkouts
  add column if not exists origin_source text,
  add column if not exists origin_actor_kind text check (origin_actor_kind is null or origin_actor_kind in ('customer', 'integration', 'system')),
  add column if not exists detailed_activity_started_at timestamptz;

commit;
