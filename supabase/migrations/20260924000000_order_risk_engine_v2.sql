begin;

create table if not exists public.order_risk_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_id uuid null,
  review_id uuid null,
  route text not null check (route in ('public_v1', 'custom_webhook')),
  mode text not null check (mode in ('shadow', 'active')),
  decision text not null check (decision in ('ALLOW', 'HOLD', 'BLOCK')),
  score integer not null check (score >= 0),
  signals jsonb not null default '[]'::jsonb check (jsonb_typeof(signals) = 'array'),
  reasons text[] not null default '{}',
  customer_name text null,
  phone text null,
  address text null,
  parsed_district text null,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  total numeric null,
  phone_hash text null check (phone_hash ~ '^[0-9a-f]{64}$'),
  device_hash text null check (device_hash ~ '^[0-9a-f]{64}$'),
  fingerprint_hash text null check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  network_hash text null check (network_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text null check (ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent_hash text null check (user_agent_hash ~ '^[0-9a-f]{64}$'),
  ip_prefix text null,
  network_type text null,
  geo_city text null,
  geo_region text null,
  geo_country text null,
  user_agent_summary text null,
  context_trusted boolean not null default false,
  label text null check (label in ('fake', 'genuine')),
  labelled_at timestamptz null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create table if not exists public.order_risk_list_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  list text not null check (list in ('block', 'allow')),
  kind text not null check (kind in ('phone', 'device', 'fingerprint', 'network')),
  value_hash text not null check (value_hash ~ '^[0-9a-f]{64}$'),
  display_hint text null,
  reason text null,
  source_attempt_id uuid null references public.order_risk_attempts(id) on delete set null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  expires_at timestamptz null,
  unique (org_id, list, kind, value_hash)
);

create index if not exists order_risk_attempts_org_created_idx on public.order_risk_attempts (org_id, created_at desc);
create index if not exists order_risk_attempts_org_decision_created_idx on public.order_risk_attempts (org_id, decision, created_at desc);
create index if not exists order_risk_attempts_org_phone_idx on public.order_risk_attempts (org_id, phone_hash);
create index if not exists order_risk_attempts_org_device_idx on public.order_risk_attempts (org_id, device_hash);
create index if not exists order_risk_attempts_org_fingerprint_idx on public.order_risk_attempts (org_id, fingerprint_hash);
create index if not exists order_risk_attempts_org_network_idx on public.order_risk_attempts (org_id, network_hash);
create index if not exists order_risk_attempts_org_order_idx on public.order_risk_attempts (org_id, order_id) where order_id is not null;
create index if not exists order_risk_attempts_expires_idx on public.order_risk_attempts (expires_at);
create index if not exists order_risk_list_entries_org_list_created_idx on public.order_risk_list_entries (org_id, list, created_at desc);

alter table public.orders add column if not exists risk_attempt_id uuid;
alter table public.order_protection_reviews add column if not exists attempt_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_risk_attempt_id_fkey') then
    alter table public.orders add constraint orders_risk_attempt_id_fkey foreign key (risk_attempt_id) references public.order_risk_attempts(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.order_protection_reviews'::regclass and conname = 'order_protection_reviews_attempt_id_fkey') then
    alter table public.order_protection_reviews add constraint order_protection_reviews_attempt_id_fkey foreign key (attempt_id) references public.order_risk_attempts(id) on delete set null;
  end if;
end
$$;
create index if not exists orders_risk_attempt_id_idx on public.orders (risk_attempt_id) where risk_attempt_id is not null;

alter table public.order_risk_attempts enable row level security;
alter table public.order_risk_list_entries enable row level security;
revoke all on public.order_risk_attempts from anon, authenticated;
revoke all on public.order_risk_list_entries from anon, authenticated;
grant all on public.order_risk_attempts to service_role;
grant all on public.order_risk_list_entries to service_role;

commit;
