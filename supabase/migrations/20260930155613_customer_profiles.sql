begin;

-- Customer identity parity with server/customers.js. Invalid/missing phones
-- remain NULL so they cannot merge unrelated people by name.
create or replace function public.normalize_customer_phone(input text)
returns text language sql immutable parallel safe security invoker
set search_path = ''
as $$
  with digits as (
    select regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g') as phone
  ), normalized as (
    select case
      when phone like '880%' then '0' || substring(phone from 4)
      when length(phone) = 10 and phone like '1%' then '0' || phone
      else phone end as phone
    from digits
  )
  select case when phone ~ '^01[0-9]{9}$' then phone else null end from normalized
$$;
revoke all on function public.normalize_customer_phone(text) from public, anon, authenticated;
grant execute on function public.normalize_customer_phone(text) to service_role;

-- ECMAScript \s includes these Unicode spaces even in C-locale databases.
-- Convert them to ordinary spaces before first Phone: label extraction so a
-- pasted nonbreaking space followed by a newline behaves like the JS parser.
create or replace function public.customer_inbox_phone(input text)
returns text language sql immutable parallel safe security invoker
set search_path = ''
as $$
  select public.normalize_customer_phone((regexp_match(
    translate(input, U&'\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff', repeat(' ', 19)),
    'Phone:[[:space:]]*([^\n,]+)', 'i'
  ))[1])
$$;
revoke all on function public.customer_inbox_phone(text) from public, anon, authenticated;
grant execute on function public.customer_inbox_phone(text) to service_role;

alter table public.orders add column if not exists customer_phone_key text
  generated always as (public.normalize_customer_phone(phone)) stored;
alter table public.social_inbox_orders add column if not exists customer_phone_key text
  generated always as (public.customer_inbox_phone(notes)) stored;

create index if not exists orders_org_customer_phone_idx
  on public.orders (org_id, customer_phone_key, created_at desc, id) where customer_phone_key is not null;
create index if not exists inbox_orders_org_customer_phone_idx
  on public.social_inbox_orders (org_id, customer_phone_key, created_at desc, id) where customer_phone_key is not null;

create table if not exists public.customer_profiles (
  org_id uuid not null,
  customer_key text not null check (customer_key ~ '^(01[0-9]{9}|(order|social):[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  follow_up_on date,
  follow_up_reason text not null default '' check (length(follow_up_reason) <= 500),
  version integer not null default 1 check (version > 0),
  updated_by uuid not null,
  updated_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, customer_key),
  check ((follow_up_on is null and follow_up_reason = '') or (follow_up_on is not null and length(trim(follow_up_reason)) > 0))
);
drop trigger if exists update_customer_profiles_updated_at on public.customer_profiles;
create trigger update_customer_profiles_updated_at before update on public.customer_profiles
  for each row execute function public.update_updated_at_column();

-- No foreign keys or cascading deletes: history survives edits to order phones
-- and deletion of staff accounts. Moving context to another identity is NOT an
-- implicit side effect of editing an order.
create table if not exists public.customer_notes (
  id uuid primary key,
  org_id uuid not null,
  customer_key text not null check (customer_key ~ '^(01[0-9]{9}|(order|social):[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'),
  body text not null check (length(trim(body)) between 1 and 4000),
  author_id uuid not null,
  author_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists customer_notes_org_customer_created_idx
  on public.customer_notes (org_id, customer_key, created_at desc, id desc);

alter table public.customer_profiles enable row level security;
alter table public.customer_notes enable row level security;
revoke all on public.customer_profiles, public.customer_notes from public, anon, authenticated, service_role;
grant select, insert, update on public.customer_profiles to service_role;
grant select, insert on public.customer_notes to service_role;

notify pgrst, 'reload schema';
commit;
