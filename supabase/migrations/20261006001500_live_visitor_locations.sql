-- Where live visitors are, for the Home page globe.
-- Additive only: two nullable columns, a redefined hit recorder that also stores
-- them, and a server-only reader. Older visits keep null coordinates; the server
-- falls back to a city-name lookup for those.
-- Plan: docs/superpowers/plans/2026-10-06-home-page.md §2.
begin;

alter table public.analytics_sessions
  add column latitude numeric(8, 5) constraint analytics_sessions_latitude_check check (latitude between -90 and 90),
  add column longitude numeric(8, 5) constraint analytics_sessions_longitude_check check (longitude between -180 and 180);

-- Same as 20261003090000_first_party_analytics.sql, plus latitude/longitude on
-- the visit's first page view (the visit's location, like country and city).
create or replace function public.record_analytics_hit(
  p_org_id uuid,
  p_event_id uuid,
  p_session_id uuid,
  p_visitor_id uuid,
  p_kind text,
  p_path text,
  p_product_slug text,
  p_active_seconds integer,
  p_received_at timestamptz,
  p_entry jsonb
) returns text language plpgsql security invoker set search_path = '' as $$
declare
  existing public.analytics_sessions%rowtype;
  inserted_event bigint;
  first_page boolean;
  entry_latitude numeric(8, 5);
  entry_longitude numeric(8, 5);
begin
  if p_org_id is null or p_event_id is null or p_session_id is null or p_visitor_id is null or p_received_at is null then
    raise exception 'record_analytics_hit: missing required argument';
  end if;

  select * into existing from public.analytics_sessions where id = p_session_id for update;
  if found and existing.org_id <> p_org_id then
    return 'rejected';
  end if;
  if found and existing.last_seen_at < p_received_at - interval '30 minutes' then
    return 'expired';
  end if;

  if not found then
    -- An engagement flush or step cannot open a visit on its own.
    if p_kind <> 'page_view' then
      return 'expired';
    end if;
    -- Coordinates are kept only when both are present and in range.
    if jsonb_typeof(p_entry->'latitude') = 'number' and jsonb_typeof(p_entry->'longitude') = 'number'
       and (p_entry->>'latitude')::numeric between -90 and 90
       and (p_entry->>'longitude')::numeric between -180 and 180 then
      entry_latitude := round((p_entry->>'latitude')::numeric, 5);
      entry_longitude := round((p_entry->>'longitude')::numeric, 5);
    end if;
    insert into public.analytics_sessions (
      id, org_id, visitor_id, started_at, last_seen_at, is_new_visitor, entry_path, referrer_host, source, medium,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term, device, country, city, latitude, longitude
    ) values (
      p_session_id, p_org_id, p_visitor_id, p_received_at, p_received_at,
      not exists (select 1 from public.analytics_sessions s where s.org_id = p_org_id and s.visitor_id = p_visitor_id),
      p_path, p_entry->>'referrer_host', coalesce(p_entry->>'source', 'direct'), coalesce(p_entry->>'medium', 'none'),
      p_entry->>'utm_source', p_entry->>'utm_medium', p_entry->>'utm_campaign', p_entry->>'utm_content', p_entry->>'utm_term',
      coalesce(p_entry->>'device', 'unknown'), p_entry->>'country', p_entry->>'city', entry_latitude, entry_longitude
    )
    on conflict (id) do nothing;
    select * into existing from public.analytics_sessions where id = p_session_id for update;
    if existing.org_id <> p_org_id then
      return 'rejected';
    end if;
  end if;

  insert into public.analytics_events (org_id, event_id, session_id, visitor_id, kind, path, product_slug, active_seconds, received_at)
  values (p_org_id, p_event_id, p_session_id, p_visitor_id, p_kind, p_path, p_product_slug, coalesce(p_active_seconds, 0), p_received_at)
  on conflict (org_id, event_id) do nothing
  returning id into inserted_event;
  if inserted_event is null then
    return 'duplicate';
  end if;

  first_page := existing.pageviews = 0;
  update public.analytics_sessions set
    last_seen_at = greatest(last_seen_at, p_received_at),
    pageviews = pageviews + (p_kind = 'page_view')::int,
    product_views = product_views + (p_kind = 'page_view' and p_product_slug is not null)::int,
    engaged_seconds = least(86400, engaged_seconds + case when p_kind = 'engage' then coalesce(p_active_seconds, 0) else 0 end),
    cart_at = case when p_kind = 'cart' then coalesce(cart_at, p_received_at) else cart_at end,
    checkout_at = case when p_kind = 'checkout' then coalesce(checkout_at, p_received_at) else checkout_at end,
    purchase_signal_at = case when p_kind = 'purchase_signal' then coalesce(purchase_signal_at, p_received_at) else purchase_signal_at end
  where id = p_session_id;

  if p_kind = 'page_view' then
    insert into public.analytics_session_pages (org_id, session_id, path, views, is_entry, first_seen_at)
    values (p_org_id, p_session_id, p_path, 1, first_page, p_received_at)
    on conflict (session_id, path) do update set views = public.analytics_session_pages.views + 1;
    if p_product_slug is not null then
      insert into public.analytics_session_products (org_id, session_id, product_slug, views, first_seen_at)
      values (p_org_id, p_session_id, p_product_slug, 1, p_received_at)
      on conflict (session_id, product_slug) do update set views = public.analytics_session_products.views + 1;
    end if;
  end if;
  return 'recorded';
end;
$$;

revoke all on function public.record_analytics_hit(uuid, uuid, uuid, uuid, text, text, text, integer, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.record_analytics_hit(uuid, uuid, uuid, uuid, text, text, text, integer, timestamptz, jsonb) to service_role;

-- Live visitors' city-level locations and latest page, newest first.
-- Returns no session, visitor or event identifiers.
create or replace function public.live_visitor_locations(p_org_id uuid, p_window_seconds integer)
returns table (city text, country text, latitude numeric, longitude numeric, path text, last_seen_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select s.city, s.country, s.latitude, s.longitude, latest.path, p.last_seen_at
  from public.live_visitor_presence p
  -- Presence ids are unvalidated text; only UUID-shaped ones can name a visit.
  join public.analytics_sessions s on s.org_id = p.org_id
    and s.id = case when p.session_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p.session_id::uuid end
  left join lateral (
    select e.path from public.analytics_events e
    where e.org_id = p.org_id and e.session_id = s.id and e.kind = 'page_view'
    order by e.received_at desc
    limit 1
  ) latest on true
  where p.org_id = p_org_id
    and p.bucket = 'all'
    and p.last_seen_at > now() - make_interval(secs => p_window_seconds)
  order by p.last_seen_at desc
  limit 20;
$$;

revoke all on function public.live_visitor_locations(uuid, integer) from public, anon, authenticated;
grant execute on function public.live_visitor_locations(uuid, integer) to service_role;

commit;
