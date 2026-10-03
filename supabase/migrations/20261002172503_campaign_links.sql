-- Campaign Links Phase A only. Additive: no backfill, destructive reconciliation,
-- startup DDL, new checkout event stream, or Meta-spend fields.
begin;

create table public.campaign_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  slug text not null constraint campaign_links_slug_check
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  name text not null constraint campaign_links_name_check
    check (char_length(name) between 1 and 120 and char_length(btrim(name)) > 0),
  channel text not null constraint campaign_links_channel_check
    check (channel in ('facebook','instagram','tiktok','youtube','whatsapp','influencer','print','sms','other')),
  -- Full URL normalization / decoded loop rejection is additionally required
  -- in the server and storefront. Metadata post_url is never a destination.
  destination_path text not null default '/' constraint campaign_links_destination_path_check
    check (char_length(destination_path) between 1 and 200
      and left(destination_path, 1) = '/' and left(destination_path, 2) <> '//'
      and position(chr(92) in destination_path) = 0
      and destination_path !~ '[[:cntrl:]]'
      and destination_path !~ '^/go([/?#]|$)'),
  creator_name text constraint campaign_links_creator_name_check check (char_length(creator_name) <= 120),
  post_url text constraint campaign_links_post_url_check
    check (char_length(post_url) <= 2048 and post_url ~* '^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$'),
  notes text constraint campaign_links_notes_check check (char_length(notes) <= 2000),
  created_by uuid references auth.users(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_links_org_slug_key unique (org_id, slug),
  constraint campaign_links_org_id_key unique (org_id, id)
);

create table public.campaign_link_clicks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  link_id uuid not null,
  request_id uuid not null,
  clicked_at timestamptz not null default clock_timestamp()
    constraint campaign_link_clicks_clicked_at_check check (isfinite(clicked_at)),
  -- Domain-separated, keyed daily HMAC; no raw IP or user agent is stored.
  visitor_hash text constraint campaign_link_clicks_visitor_hash_check check (visitor_hash ~ '^[0-9a-f]{64}$'),
  referrer_host text constraint campaign_link_clicks_referrer_host_check
    check (char_length(referrer_host) <= 253 and referrer_host !~ '[[:space:]/?#@]'),
  device text constraint campaign_link_clicks_device_check check (device in ('mobile','desktop','tablet','unknown')),
  is_bot boolean not null default false,
  constraint campaign_link_clicks_org_link_fkey foreign key (org_id, link_id)
    references public.campaign_links(org_id, id) on delete restrict,
  constraint campaign_link_clicks_org_request_key unique (org_id, request_id),
  constraint campaign_link_clicks_org_link_id_key unique (org_id, link_id, id)
);

create index campaign_links_created_by_idx on public.campaign_links(created_by) where created_by is not null;
create index campaign_link_clicks_org_clicked_id_idx on public.campaign_link_clicks(org_id, clicked_at, id);
create index campaign_link_clicks_org_link_clicked_id_idx on public.campaign_link_clicks(org_id, link_id, clicked_at, id);

alter table public.orders
  add column campaign_link_id uuid,
  add column campaign_click_id uuid,
  add column campaign_attributed_at timestamptz,
  add constraint orders_campaign_triple_check check (
    num_nonnulls(campaign_link_id, campaign_click_id, campaign_attributed_at) = 0
    or (num_nonnulls(campaign_link_id, campaign_click_id, campaign_attributed_at) = 3 and isfinite(campaign_attributed_at))
  ),
  add constraint orders_campaign_org_link_click_fkey foreign key (org_id, campaign_link_id, campaign_click_id)
    references public.campaign_link_clicks(org_id, link_id, id) on delete restrict;

alter table public.abandoned_checkouts
  add column campaign_link_id uuid,
  add column campaign_click_id uuid,
  add column campaign_attributed_at timestamptz,
  add constraint abandoned_checkouts_campaign_triple_check check (
    num_nonnulls(campaign_link_id, campaign_click_id, campaign_attributed_at) = 0
    or (num_nonnulls(campaign_link_id, campaign_click_id, campaign_attributed_at) = 3 and isfinite(campaign_attributed_at))
  ),
  add constraint abandoned_checkouts_campaign_org_link_click_fkey foreign key (org_id, campaign_link_id, campaign_click_id)
    references public.campaign_link_clicks(org_id, link_id, id) on delete restrict;

alter table public.order_protection_reviews
  add column campaign_link_id uuid,
  add column campaign_click_id uuid,
  add column campaign_attributed_at timestamptz,
  add constraint order_protection_reviews_campaign_triple_check check (
    num_nonnulls(campaign_link_id, campaign_click_id, campaign_attributed_at) = 0
    or (num_nonnulls(campaign_link_id, campaign_click_id, campaign_attributed_at) = 3 and isfinite(campaign_attributed_at))
  ),
  add constraint order_protection_reviews_campaign_org_link_click_fkey foreign key (org_id, campaign_link_id, campaign_click_id)
    references public.campaign_link_clicks(org_id, link_id, id) on delete restrict;

create index orders_org_campaign_link_click_idx on public.orders(org_id, campaign_link_id, campaign_click_id) where campaign_click_id is not null;
create index abandoned_checkouts_org_campaign_link_click_idx on public.abandoned_checkouts(org_id, campaign_link_id, campaign_click_id) where campaign_click_id is not null;
create index order_protection_reviews_org_campaign_link_click_idx on public.order_protection_reviews(org_id, campaign_link_id, campaign_click_id) where campaign_click_id is not null;
create index orders_org_campaign_click_idx on public.orders(org_id, campaign_click_id) where campaign_click_id is not null;
create index abandoned_checkouts_org_campaign_click_idx on public.abandoned_checkouts(org_id, campaign_click_id) where campaign_click_id is not null;
-- Existing orders_org_abandoned_checkout_id_idx, orders_org_abandoned_draft_key_hash_idx
-- and abandoned_checkouts_org_id_draft_key_key already cover draft reconciliation.

alter table public.campaign_links enable row level security;
alter table public.campaign_link_clicks enable row level security;
-- No browser policies. Explicit least-privilege grants also override project defaults.
revoke all on public.campaign_links, public.campaign_link_clicks from public, anon, authenticated, service_role;
grant select, insert, update on public.campaign_links to service_role;
grant select, insert on public.campaign_link_clicks to service_role;

-- Every click insertion (including a direct server insert) takes the same link
-- row lock as a rename. Trigger defense prevents bypassing the RPC invariant.
create function public.campaign_click_lock_link()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.campaign_links where org_id = new.org_id and id = new.link_id for update;
  if not found then
    raise exception using errcode = '23503', message = 'campaign click violates foreign key constraint';
  end if;
  return new;
end;
$$;
create trigger campaign_click_lock_link before insert on public.campaign_link_clicks
  for each row execute function public.campaign_click_lock_link();

create function public.campaign_link_preserve_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.org_id is distinct from old.org_id then
    raise exception using errcode = '23514', message = 'campaign link identity is immutable';
  end if;
  if new.slug is distinct from old.slug and exists (
    select 1 from public.campaign_link_clicks where org_id = old.org_id and link_id = old.id
  ) then
    raise exception using errcode = '23514', message = 'campaign slug is locked after its first click';
  end if;
  return new;
end;
$$;
create trigger campaign_link_preserve_identity before update on public.campaign_links
  for each row execute function public.campaign_link_preserve_identity();
create trigger update_campaign_links_updated_at before update on public.campaign_links
  for each row execute function public.update_updated_at_column();

create function public.rename_campaign_link(p_org_id uuid, p_link_id uuid, p_slug text)
returns setof public.campaign_links language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.campaign_links where org_id = p_org_id and id = p_link_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'campaign link not found';
  end if;
  -- Row lock is acquired before the trigger checks clicks, avoiding check/update races.
  return query update public.campaign_links set slug = p_slug
    where org_id = p_org_id and id = p_link_id returning *;
end;
$$;

create function public.record_campaign_link_click(
  p_org_id uuid, p_link_id uuid, p_slug text, p_request_id uuid,
  p_visitor_hash text default null, p_referrer_host text default null,
  p_device text default 'unknown', p_is_bot boolean default false
)
returns setof public.campaign_link_clicks language plpgsql security invoker set search_path = '' as $$
declare
  locked_link public.campaign_links;
  saved_click public.campaign_link_clicks;
begin
  select * into locked_link from public.campaign_links
    where org_id = p_org_id and id = p_link_id for update;
  if not found or locked_link.slug is distinct from p_slug then
    raise exception using errcode = 'P0002', message = 'campaign link not found';
  end if;
  insert into public.campaign_link_clicks(org_id, link_id, request_id, visitor_hash, referrer_host, device, is_bot)
    values (p_org_id, p_link_id, p_request_id, p_visitor_hash, p_referrer_host, p_device, p_is_bot)
    on conflict (org_id, request_id) do nothing returning * into saved_click;
  if not found then
    -- Separate statement sees the committed winner after a uniqueness wait.
    select * into saved_click from public.campaign_link_clicks
      where org_id = p_org_id and request_id = p_request_id;
    if saved_click.link_id is distinct from p_link_id then
      raise exception using errcode = '23505', message = 'request belongs to another campaign link';
    end if;
  end if;
  return next saved_click;
end;
$$;

-- Called only with a server-resolved workspace and server-generated effective
-- time, after normal capture persistence. Marketing failure must not undo capture.
-- The draft-row lock serializes the compare/update, including reordered requests.
-- Null/missing/invalid/older input returns the unchanged draft; no clear operation.
create function public.attribute_campaign_checkout(
  p_org_id uuid, p_checkout_id uuid, p_click_id uuid, p_effective_at timestamptz
)
returns setof public.abandoned_checkouts language plpgsql security invoker set search_path = '' as $$
declare
  checkout public.abandoned_checkouts;
  incoming public.campaign_link_clicks;
  saved_clicked_at timestamptz;
begin
  select * into checkout from public.abandoned_checkouts
    where org_id = p_org_id and id = p_checkout_id for update;
  if not found then return; end if;
  if checkout.status not in ('open','contacted') or checkout.expires_at <= clock_timestamp()
     or p_effective_at is null or not isfinite(p_effective_at) then
    return next checkout;
    return;
  end if;
  select * into incoming from public.campaign_link_clicks
    where org_id = p_org_id and id = p_click_id and not is_bot
      and clicked_at <= p_effective_at and p_effective_at - clicked_at <= interval '720 hours';
  if not found then return next checkout; return; end if;
  select clicked_at into saved_clicked_at from public.campaign_link_clicks
    where org_id = p_org_id and link_id = checkout.campaign_link_id and id = checkout.campaign_click_id;
  if saved_clicked_at is null or incoming.clicked_at >= saved_clicked_at then
    update public.abandoned_checkouts set campaign_link_id = incoming.link_id,
      campaign_click_id = incoming.id, campaign_attributed_at = p_effective_at
      where org_id = p_org_id and id = p_checkout_id returning * into checkout;
  end if;
  return next checkout;
end;
$$;

-- Order attribution freezes at insert, even when all-null. Reconciliation may
-- add durable draft linkage later, but cannot restate a completed conversion.
create function public.preserve_order_campaign_attribution()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (new.campaign_link_id, new.campaign_click_id, new.campaign_attributed_at)
    is distinct from (old.campaign_link_id, old.campaign_click_id, old.campaign_attributed_at) then
    raise exception using errcode = '23514', message = 'order campaign attribution is immutable';
  end if;
  return new;
end;
$$;
create trigger preserve_order_campaign_attribution before update on public.orders
  for each row execute function public.preserve_order_campaign_attribution();

revoke all on function public.campaign_click_lock_link(), public.campaign_link_preserve_identity(),
  public.preserve_order_campaign_attribution(), public.rename_campaign_link(uuid,uuid,text),
  public.record_campaign_link_click(uuid,uuid,text,uuid,text,text,text,boolean),
  public.attribute_campaign_checkout(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.campaign_click_lock_link(), public.campaign_link_preserve_identity(),
  public.preserve_order_campaign_attribution(), public.rename_campaign_link(uuid,uuid,text),
  public.record_campaign_link_click(uuid,uuid,text,uuid,text,text,text,boolean),
  public.attribute_campaign_checkout(uuid,uuid,uuid,timestamptz) to service_role;

-- Existing PII scrub patches / SQL scrubber do not touch the new scalar triple.
-- Deliberately do not add a click-retention TTL or change Order Protection retention.
notify pgrst, 'reload schema';
commit;
