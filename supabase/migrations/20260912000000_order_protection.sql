create table if not exists public.order_protection_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_id uuid null,
  review_id uuid null,
  route text not null,
  decision text not null check (decision in ('ALLOW', 'REVIEW', 'BLOCK')),
  score integer not null check (score between 0 and 100),
  reason_codes text[] not null default '{}',
  phone_hash text null,
  session_hash text null,
  ip_hash text null,
  network_hash text null,
  user_agent_hash text null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.order_protection_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  status text not null default 'on_hold' check (status in ('on_hold', 'approved', 'rejected', 'expired')),
  source_route text not null,
  customer_name text null,
  phone text null,
  address text null,
  items jsonb not null default '[]'::jsonb,
  shipping_zone_id text null,
  notes text null,
  score integer not null check (score between 0 and 100),
  reason_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists order_protection_events_org_phone_created_idx
  on public.order_protection_events (org_id, phone_hash, created_at desc);
create index if not exists order_protection_events_expires_idx
  on public.order_protection_events (org_id, expires_at);
create index if not exists order_protection_reviews_org_status_created_idx
  on public.order_protection_reviews (org_id, status, created_at desc);
create index if not exists order_protection_reviews_expires_idx
  on public.order_protection_reviews (org_id, expires_at);

alter table public.order_protection_events enable row level security;
alter table public.order_protection_reviews enable row level security;
revoke all on public.order_protection_events, public.order_protection_reviews from public, anon, authenticated;
grant all on public.order_protection_events, public.order_protection_reviews to service_role;

create or replace function public.scrub_expired_order_protection_reviews()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  scrubbed integer;
begin
  update public.order_protection_reviews
  set status = 'expired',
      customer_name = null,
      phone = null,
      address = null,
      items = '[]'::jsonb,
      shipping_zone_id = null,
      notes = null,
      updated_at = now()
  where status = 'on_hold' and expires_at < now();
  get diagnostics scrubbed = row_count;
  return scrubbed;
end;
$$;

revoke all on function public.scrub_expired_order_protection_reviews() from public;
grant execute on function public.scrub_expired_order_protection_reviews() to service_role;
