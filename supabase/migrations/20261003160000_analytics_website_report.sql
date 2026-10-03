-- First-party website analytics, Phase 3 (reports for the Analytics page).
-- Read-only functions. Traffic metrics use visits started in the range plus
-- their later orders; acquisition economics use orders placed in the range,
-- credited to their frozen first/last visit (see analytics_order_facts).
-- Plan: docs/superpowers/plans/2026-10-03-analytics-page.md (Phase 3) and
-- docs/superpowers/plans/2026-10-02-first-party-analytics-revised.md §4–§6.
begin;

-- Mirrors customerOrderOutcome() in server/customerOutcomes.js (parity tested):
-- delivered, partial_delivered, returned, cancelled or active.
create function public.analytics_order_outcome(p_status text, p_courier_status text, p_fulfillment_status text, p_return_status text)
returns text language sql immutable set search_path = '' as $$
  select case
    when n.ret in ('returned', 'completed') then 'returned'
    when n.courier ~ 'return.*pending' then 'active'
    when 'returned' in (n.status, n.courier, n.fulfillment) then 'returned'
    when n.status in ('cancelled', 'canceled', 'rejected') or n.courier in ('cancelled', 'canceled', 'rejected')
      or n.fulfillment in ('cancelled', 'canceled', 'rejected') then 'cancelled'
    when n.status like 'partial\_delivered%' or n.courier like 'partial\_delivered%' or n.fulfillment like 'partial\_delivered%' then 'partial_delivered'
    when 'delivered' in (n.status, n.courier, n.fulfillment) then 'delivered'
    else 'active'
  end
  from (select
    regexp_replace(regexp_replace(lower(coalesce(p_status, '')), '^\s+|\s+$', '', 'g'), '[\s-]+', '_', 'g') as status,
    regexp_replace(regexp_replace(lower(coalesce(p_courier_status, '')), '^\s+|\s+$', '', 'g'), '[\s-]+', '_', 'g') as courier,
    regexp_replace(regexp_replace(lower(coalesce(p_fulfillment_status, '')), '^\s+|\s+$', '', 'g'), '[\s-]+', '_', 'g') as fulfillment,
    regexp_replace(regexp_replace(lower(coalesce(p_return_status, '')), '^\s+|\s+$', '', 'g'), '[\s-]+', '_', 'g') as ret
  ) n
$$;

create function public.analytics_website_report(p_org_id uuid, p_since timestamptz, p_until timestamptz)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  result jsonb;
begin
  if p_org_id is null or p_since is null or p_until is null or p_until <= p_since or p_until - p_since > interval '367 days' then
    raise exception 'analytics_website_report: invalid range';
  end if;

  with v as (
    select s.*, s.started_at at time zone 'Asia/Dhaka' as local_at
    from public.analytics_sessions s
    where s.org_id = p_org_id and s.started_at >= p_since and s.started_at < p_until
  ),
  -- Orders placed from these visits (traffic cohort), with their current outcome.
  f as (
    select f.order_id, f.session_id, o.price,
      public.analytics_order_outcome(o.status, o.courier_status, o.fulfillment_status, o.return_status) as outcome
    from public.analytics_order_facts f
    join public.orders o on o.id = f.order_id and o.org_id = f.org_id
    where f.org_id = p_org_id and f.session_id in (select v.id from v)
  ),
  fo as (
    select f.session_id, count(*) as orders, count(*) filter (where f.outcome = 'delivered') as delivered
    from f group by f.session_id
  ),
  vs as (
    select v.*, coalesce(fo.orders, 0) as orders, coalesce(fo.delivered, 0) as delivered
    from v left join fo on fo.session_id = v.id
  ),
  -- Orders placed in the range (acquisition cohort), credited to frozen touches.
  a as (
    select f.*, o.price,
      public.analytics_order_outcome(o.status, o.courier_status, o.fulfillment_status, o.return_status) as outcome
    from public.analytics_order_facts f
    join public.orders o on o.id = f.order_id and o.org_id = f.org_id
    where f.org_id = p_org_id and f.submitted_at >= p_since and f.submitted_at < p_until
  ),
  top_products as (
    select sp.product_slug, sum(sp.views) as views, count(*) as sessions, count(*) filter (where vs.orders > 0) as ordered_sessions
    from public.analytics_session_products sp
    join vs on vs.id = sp.session_id
    where sp.org_id = p_org_id
    group by sp.product_slug
    order by views desc, sp.product_slug
    limit 15
  ),
  product_orders as (
    select p.slug, count(distinct f.order_id) as orders, count(distinct f.order_id) filter (where f.outcome = 'delivered') as delivered
    from f
    join public.order_items oi on oi.order_id = f.order_id and oi.org_id = p_org_id
    join public.products p on p.id = oi.product_id and p.org_id = p_org_id
    where p.slug in (select tp.product_slug from top_products tp)
    group by p.slug
  )
  select jsonb_build_object(
    'totals', (select jsonb_build_object(
      'sessions', count(*),
      'visitors', count(distinct vs.visitor_id),
      'new_visitors', count(distinct vs.visitor_id) filter (where vs.is_new_visitor),
      'pageviews', coalesce(sum(vs.pageviews), 0),
      'product_views', coalesce(sum(vs.product_views), 0),
      'engaged_seconds', coalesce(sum(vs.engaged_seconds), 0),
      'bounced_sessions', count(*) filter (where vs.pageviews <= 1),
      'product_sessions', count(*) filter (where vs.product_views > 0),
      'cart_sessions', count(*) filter (where vs.cart_at is not null),
      'checkout_sessions', count(*) filter (where vs.checkout_at is not null),
      'ordered_sessions', count(*) filter (where vs.orders > 0),
      'orders', coalesce(sum(vs.orders), 0),
      'delivered_sessions', count(*) filter (where vs.delivered > 0)
    ) from vs),
    'daily', coalesce((select jsonb_agg(d order by d.day) from (
      select vs.local_at::date as day, count(*) as sessions, count(distinct vs.visitor_id) as visitors,
        sum(vs.pageviews) as pageviews, count(*) filter (where vs.orders > 0) as ordered_sessions
      from vs group by 1
    ) d), '[]'::jsonb),
    'hourly', coalesce((select jsonb_agg(h order by h.hour) from (
      select extract(hour from vs.local_at)::int as hour, count(*) as sessions
      from vs group by 1
    ) h), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(x order by x.sessions desc, x.source, x.medium) from (
      select vs.source, vs.medium, count(*) as sessions, count(distinct vs.visitor_id) as visitors,
        count(*) filter (where vs.pageviews <= 1) as bounced_sessions, count(*) filter (where vs.orders > 0) as ordered_sessions,
        sum(vs.orders) as orders
      from vs group by vs.source, vs.medium order by sessions desc, vs.source, vs.medium limit 15
    ) x), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(x order by x.sessions desc, x.campaign) from (
      select vs.utm_campaign as campaign, count(*) as sessions, count(*) filter (where vs.orders > 0) as ordered_sessions
      from vs where vs.utm_campaign is not null group by vs.utm_campaign order by sessions desc, vs.utm_campaign limit 15
    ) x), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(x order by x.sessions desc, x.device) from (
      select vs.device, count(*) as sessions, count(*) filter (where vs.cart_at is not null) as cart_sessions,
        count(*) filter (where vs.orders > 0) as ordered_sessions
      from vs group by vs.device
    ) x), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(x order by x.views desc, x.path) from (
      select sp.path, sum(sp.views) as views, count(*) as sessions, count(*) filter (where sp.is_entry) as entries
      from public.analytics_session_pages sp join vs on vs.id = sp.session_id
      where sp.org_id = p_org_id group by sp.path order by views desc, sp.path limit 15
    ) x), '[]'::jsonb),
    'entry_pages', coalesce((select jsonb_agg(x order by x.sessions desc, x.path) from (
      select vs.entry_path as path, count(*) as sessions, count(*) filter (where vs.pageviews <= 1) as bounced_sessions,
        count(*) filter (where vs.orders > 0) as ordered_sessions, sum(vs.orders) as orders
      from vs group by vs.entry_path order by sessions desc, vs.entry_path limit 15
    ) x), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(x order by x.views desc, x.product_slug) from (
      select tp.product_slug, pr.name, tp.views, tp.sessions, tp.ordered_sessions,
        coalesce(po.orders, 0) as orders, coalesce(po.delivered, 0) as delivered
      from top_products tp
      left join product_orders po on po.slug = tp.product_slug
      left join public.products pr on pr.org_id = p_org_id and pr.slug = tp.product_slug
    ) x), '[]'::jsonb),
    'acquisition', jsonb_build_object(
      'last', coalesce((select jsonb_agg(x order by x.orders desc, x.source, x.medium) from (
        select a.last_source as source, a.last_medium as medium, count(*) as orders,
          coalesce(sum(a.price) filter (where a.outcome <> 'cancelled'), 0) as placed_value,
          count(*) filter (where a.outcome = 'delivered') as delivered,
          coalesce(sum(a.price) filter (where a.outcome = 'delivered'), 0) as delivered_value,
          count(*) filter (where a.outcome = 'partial_delivered') as partial_delivered,
          count(*) filter (where a.outcome = 'returned') as returned,
          count(*) filter (where a.outcome = 'cancelled') as cancelled,
          count(*) filter (where a.outcome = 'active') as active
        from a group by a.last_source, a.last_medium
      ) x), '[]'::jsonb),
      'first', coalesce((select jsonb_agg(x order by x.orders desc, x.source, x.medium) from (
        select a.first_source as source, a.first_medium as medium, count(*) as orders,
          coalesce(sum(a.price) filter (where a.outcome <> 'cancelled'), 0) as placed_value,
          count(*) filter (where a.outcome = 'delivered') as delivered,
          coalesce(sum(a.price) filter (where a.outcome = 'delivered'), 0) as delivered_value,
          count(*) filter (where a.outcome = 'partial_delivered') as partial_delivered,
          count(*) filter (where a.outcome = 'returned') as returned,
          count(*) filter (where a.outcome = 'cancelled') as cancelled,
          count(*) filter (where a.outcome = 'active') as active
        from a group by a.first_source, a.first_medium
      ) x), '[]'::jsonb),
      'campaigns', coalesce((select jsonb_agg(x order by x.orders desc, x.campaign) from (
        select a.last_utm_campaign as campaign, count(*) as orders,
          count(*) filter (where a.outcome = 'delivered') as delivered,
          coalesce(sum(a.price) filter (where a.outcome = 'delivered'), 0) as delivered_value
        from a where a.last_utm_campaign is not null group by a.last_utm_campaign order by orders desc, a.last_utm_campaign limit 15
      ) x), '[]'::jsonb),
      'website_orders', (select count(*) from public.orders o
        where o.org_id = p_org_id and o.source = 'website' and o.created_at >= p_since and o.created_at < p_until),
      'matched_orders', (select count(*) from a)
    )
  ) into result;
  return result;
end;
$$;

revoke all on function public.analytics_order_outcome(text, text, text, text) from public, anon, authenticated;
grant execute on function public.analytics_order_outcome(text, text, text, text) to service_role;
revoke all on function public.analytics_website_report(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.analytics_website_report(uuid, timestamptz, timestamptz) to service_role;

commit;
