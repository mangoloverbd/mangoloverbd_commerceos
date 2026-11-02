-- Blocked customers: staff block a phone number or a device from ordering,
-- either from the order editor or by adding a row here in the Supabase table
-- editor. Checkout refuses a match regardless of Order Protection mode.
-- `phone` is the plain local number (01XXXXXXXXX). `device_hash` is the HMAC
-- device code that new website orders now record in orders.device_hash.
-- Additive and data-preserving.
begin;

alter table public.orders
  add column if not exists device_hash text;

create table if not exists public.blocked_customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  phone text null check (phone ~ '^01[3-9][0-9]{8}$'),
  device_hash text null check (device_hash ~ '^[0-9a-f]{64}$'),
  note text null check (char_length(note) <= 200),
  source_order_id uuid null references public.orders(id) on delete set null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint blocked_customers_phone_or_device check (phone is not null or device_hash is not null),
  constraint blocked_customers_org_phone_key unique (org_id, phone),
  constraint blocked_customers_org_device_key unique (org_id, device_hash)
);

create index if not exists blocked_customers_source_order_idx
  on public.blocked_customers (source_order_id) where source_order_id is not null;

-- Server-only table: the service role bypasses RLS; no client policies.
alter table public.blocked_customers enable row level security;

commit;
