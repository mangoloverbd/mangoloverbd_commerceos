-- Canonical schema reconciliation for the single Mango Lover BD deployment.
--
-- The target project was provisioned before this repository baseline was ready.
-- Every operation therefore preserves existing Auth users, workspace roles,
-- settings, catalog, inventory, and operational rows while also succeeding on a
-- fresh database. It contains schema only and seeds no application data.

begin;

revoke create on schema public from public;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

do $$
begin
  create type public.app_role as enum ('admin', 'team_member');
exception
  when duplicate_object then null;
end
$$;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null,
  role public.app_role not null default 'team_member',
  created_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists user_roles_org_id_idx on public.user_roles (org_id);

alter table public.user_roles
  add column if not exists created_at timestamptz not null default now();

create or replace function public.current_user_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ur.org_id
  from public.user_roles as ur
  where ur.user_id = (select auth.uid())
  limit 1
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ur.role::text
  from public.user_roles as ur
  where ur.user_id = (select auth.uid())
  limit 1
$$;

create or replace function public.has_role(uid uuid, check_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles as ur
    where ur.user_id = uid
      and ur.role = check_role
  )
$$;

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  shopify_order_id bigint,
  order_number text not null,
  customer_name text,
  phone text,
  address text,
  product text,
  quantity integer,
  price numeric(12, 2),
  status text not null default 'pending' check (status = any (array[
    'pending', 'confirmed', 'cancelled', 'delivered', 'returned',
    'processing', 'partial_delivered', 'rejected', 'fulfilled'
  ]::text[])),
  fraud_checked boolean not null default false,
  fraud_data jsonb,
  delivery_rate numeric(12, 2),
  courier_status text,
  consignment_id text,
  tracking_code text,
  courier_message text,
  courier_name text,
  sent_to_courier boolean not null default false,
  notes text,
  fulfillment_status text,
  payment_method text,
  discount numeric(12, 2) not null default 0,
  advanced_payment numeric(12, 2) not null default 0,
  source text,
  courier_fee numeric(12, 2),
  return_requested_at timestamptz,
  return_status text,
  return_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, shopify_order_id)
);

alter table public.orders
  add column if not exists courier_name text,
  add column if not exists payment_method text,
  add column if not exists discount numeric(12, 2) not null default 0,
  add column if not exists advanced_payment numeric(12, 2) not null default 0;

create unique index if not exists orders_org_shopify_order_id_unique_idx
on public.orders (org_id, shopify_order_id)
where shopify_order_id is not null;
create index if not exists orders_org_created_at_idx on public.orders (org_id, created_at desc);
create index if not exists orders_org_status_idx on public.orders (org_id, status);
create index if not exists orders_org_order_number_idx on public.orders (org_id, order_number);

drop trigger if exists update_orders_updated_at on public.orders;
create trigger update_orders_updated_at
before update on public.orders
for each row execute function public.update_updated_at_column();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  url text,
  image_url text,
  selling_price numeric(12, 2) default 0 check (selling_price is null or selling_price >= 0),
  compare_at_price numeric(12, 2) check (compare_at_price is null or compare_at_price >= 0),
  cog numeric(12, 2) not null default 0 check (cog >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  source_url text,
  published boolean not null default false,
  published_at timestamptz,
  slug text,
  description text,
  image_embedding extensions.vector(1536),
  image_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_org_slug_unique_idx
on public.products (org_id, slug)
where slug is not null;
create index if not exists products_org_published_created_idx
on public.products (org_id, published, created_at desc);

drop trigger if exists update_products_updated_at on public.products;
create trigger update_products_updated_at
before update on public.products
for each row execute function public.update_updated_at_column();

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  storage_path text not null,
  alt_text text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, storage_path)
);

create index if not exists product_images_org_product_idx
on public.product_images (product_id, org_id, sort_order, created_at);
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  product_id uuid not null references public.products(id) on delete cascade,
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  cog numeric(12, 2) not null default 0 check (cog >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  price_adjustment numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_variants_org_product_idx
on public.product_variants (product_id, org_id);

create table if not exists public.storefront_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique,
  enabled boolean not null default false,
  store_name text,
  tagline text,
  logo_url text,
  favicon_url text,
  primary_color text not null default '#000000',
  background_color text not null default '#FAFAF8',
  font_family text not null default 'Geist Sans',
  contact_phone text,
  contact_email text,
  social_facebook text,
  social_instagram text,
  social_tiktok text,
  seo_title_template text not null default '{product_name} | {store_name}',
  seo_description_template text not null default '{product_description}',
  shipping_zones jsonb not null default '[]'::jsonb check (jsonb_typeof(shipping_zones) = 'array'),
  custom_domain text,
  custom_domain_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists update_storefront_settings_updated_at on public.storefront_settings;
create trigger update_storefront_settings_updated_at
before update on public.storefront_settings
for each row execute function public.update_updated_at_column();

create table if not exists public.social_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  platform text not null,
  contact_id text not null,
  contact_name text,
  contact_avatar text,
  last_message text,
  last_message_at timestamptz not null default now(),
  unread_count integer not null default 0 check (unread_count >= 0),
  paused_ai boolean not null default false,
  order_fields jsonb not null default '{}'::jsonb,
  ai_summary text not null default '',
  created_at timestamptz not null default now(),
  unique (org_id, platform, contact_id)
);

create index if not exists social_conversations_org_last_message_idx
on public.social_conversations (org_id, last_message_at desc);

create table if not exists public.social_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.social_conversations(id) on delete cascade,
  sender text not null,
  content text,
  image_url text,
  message_type text not null default 'text',
  created_at timestamptz not null default now()
);

create index if not exists social_messages_conversation_created_idx
on public.social_messages (conversation_id, created_at);

create table if not exists public.social_inbox_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  conversation_id uuid references public.social_conversations(id) on delete set null,
  platform text not null,
  contact_name text,
  contact_id text,
  items jsonb,
  notes text,
  total_price numeric(12, 2) not null default 0,
  status text not null default 'pending',
  sent_to_courier boolean not null default false,
  consignment_id text,
  tracking_code text,
  courier_status text,
  courier_message text,
  fraud_checked boolean not null default false,
  fraud_data jsonb,
  delivery_rate numeric(12, 2),
  courier_fee numeric(12, 2),
  return_requested_at timestamptz,
  return_status text,
  return_reason text,
  courier_name text,
  created_at timestamptz not null default now()
);

create index if not exists social_inbox_orders_org_created_idx
on public.social_inbox_orders (org_id, created_at desc);
create index if not exists social_inbox_orders_conversation_idx
on public.social_inbox_orders (conversation_id);
create index if not exists social_inbox_orders_org_status_idx
on public.social_inbox_orders (org_id, status);

create table if not exists public.meta_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique,
  connected_by_user_id uuid,
  meta_user_id text,
  meta_user_name text,
  encrypted_user_access_token text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'connected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  connection_id uuid not null references public.meta_connections(id) on delete cascade,
  page_id text not null,
  page_name text,
  encrypted_page_access_token text,
  instagram_account_id text,
  webhook_subscribed boolean not null default false,
  status text not null default 'connected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, page_id)
);

create index if not exists meta_pages_connection_idx on public.meta_pages (connection_id);

create table if not exists public.meta_instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  connection_id uuid not null references public.meta_connections(id) on delete cascade,
  page_id text,
  instagram_account_id text not null,
  username text,
  account_name text,
  status text not null default 'connected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, instagram_account_id)
);

create index if not exists meta_instagram_connection_idx on public.meta_instagram_accounts (connection_id);

create table if not exists public.meta_whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  connection_id uuid not null references public.meta_connections(id) on delete cascade,
  whatsapp_business_account_id text not null,
  phone_number_id text,
  display_phone_number text,
  account_name text,
  encrypted_access_token text,
  status text not null default 'connected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, whatsapp_business_account_id, phone_number_id)
);

create index if not exists meta_whatsapp_connection_idx on public.meta_whatsapp_accounts (connection_id);

create table if not exists public.meta_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  connection_id uuid not null references public.meta_connections(id) on delete cascade,
  ad_account_id text not null,
  account_name text,
  currency text,
  status text not null default 'connected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, ad_account_id)
);

create index if not exists meta_ad_connection_idx on public.meta_ad_accounts (connection_id);

create table if not exists public.meta_webhook_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  platform text,
  object_type text,
  page_id text,
  instagram_account_id text,
  sender_id text,
  event_type text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists meta_webhook_events_org_created_idx
on public.meta_webhook_events (org_id, created_at desc);

create table if not exists public.order_chat_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid,
  title text not null default 'New chat',
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  message_count integer not null default 0 check (message_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_chat_history_org_updated_idx
on public.order_chat_history (org_id, updated_at desc);

create table if not exists public.ai_action_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  call_id text not null,
  tool text not null,
  args jsonb not null,
  before_snapshot jsonb,
  after_snapshot jsonb,
  applied_at timestamptz not null default now()
);

create index if not exists ai_action_log_org_applied_idx
on public.ai_action_log (org_id, applied_at desc);

create or replace function public.match_products_by_embedding(
  query_embedding extensions.vector(1536),
  match_org_id uuid,
  match_threshold double precision default 0.75,
  match_count integer default 3
)
returns table (
  id uuid,
  name text,
  selling_price numeric,
  image_url text,
  image_description text,
  similarity double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select
    p.id,
    p.name,
    p.selling_price,
    p.image_url,
    p.image_description,
    (1 - (p.image_embedding <=> query_embedding))::double precision
  from public.products as p
  where p.org_id = match_org_id
    and p.image_embedding is not null
    and 1 - (p.image_embedding <=> query_embedding) > match_threshold
  order by p.image_embedding <=> query_embedding
  limit match_count
$$;

-- RLS is enabled even though normal application data access is server-side.
alter table public.user_roles enable row level security;
alter table public.app_settings enable row level security;
alter table public.orders enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.storefront_settings enable row level security;
alter table public.social_conversations enable row level security;
alter table public.social_messages enable row level security;
alter table public.social_inbox_orders enable row level security;
alter table public.meta_connections enable row level security;
alter table public.meta_pages enable row level security;
alter table public.meta_instagram_accounts enable row level security;
alter table public.meta_whatsapp_accounts enable row level security;
alter table public.meta_ad_accounts enable row level security;
alter table public.meta_webhook_events enable row level security;
alter table public.order_chat_history enable row level security;
alter table public.ai_action_log enable row level security;

-- Start from a closed Data API surface. Dashboard commerce traffic goes through
-- the authenticated Express API, which uses service_role after resolving the
-- fixed workspace. Browser roles receive no commerce-table privileges.
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

grant select on public.user_roles to authenticated;

drop policy if exists user_roles_read_own_workspace on public.user_roles;
create policy user_roles_read_own_workspace
on public.user_roles for select to authenticated
using (user_id = (select auth.uid()));

-- Server-only tables deliberately have RLS but no authenticated/anon grants or
-- policies: Meta tokens/events and the AI action audit remain service-role only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_storage_service_insert on storage.objects;
create policy product_images_storage_service_insert
on storage.objects for insert to service_role
with check (bucket_id = 'product-images');

drop policy if exists product_images_storage_service_update on storage.objects;
create policy product_images_storage_service_update
on storage.objects for update to service_role
using (bucket_id = 'product-images')
with check (bucket_id = 'product-images');

drop policy if exists product_images_storage_service_delete on storage.objects;
create policy product_images_storage_service_delete
on storage.objects for delete to service_role
using (bucket_id = 'product-images');

notify pgrst, 'reload schema';

commit;
