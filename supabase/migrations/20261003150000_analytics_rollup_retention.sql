-- First-party website analytics, Phase 2c (daily summaries and retention).
-- Additive only. A nightly job rebuilds a rolling window of Dhaka-day summaries
-- (kept indefinitely) and deletes raw events after 90 days and visits after
-- 25 months. Order facts are never deleted by retention.
-- Plan: docs/superpowers/plans/2026-10-03-analytics-page.md (Phase 2, A5) and
-- docs/superpowers/plans/2026-10-02-first-party-analytics-revised.md §7.
begin;

create table public.analytics_daily_totals (
  org_id uuid not null,
  day date not null,                                    -- Dhaka calendar day of visit start
  sessions integer not null default 0,
  visitors integer not null default 0,                  -- distinct within the day only; never sum across days
  new_visitors integer not null default 0,
  pageviews integer not null default 0,
  product_views integer not null default 0,
  engaged_seconds bigint not null default 0,
  bounced_sessions integer not null default 0,
  product_sessions integer not null default 0,
  cart_sessions integer not null default 0,
  checkout_sessions integer not null default 0,
  ordered_sessions integer not null default 0,
  orders integer not null default 0,
  definition_version smallint not null default 1,
  refreshed_at timestamptz not null,
  primary key (org_id, day)
);

create table public.analytics_daily_sources (
  org_id uuid not null,
  day date not null,
  source text not null,
  medium text not null,
  sessions integer not null default 0,
  visitors integer not null default 0,
  ordered_sessions integer not null default 0,
  orders integer not null default 0,
  definition_version smallint not null default 1,
  refreshed_at timestamptz not null,
  primary key (org_id, day, source, medium)
);

create table public.analytics_daily_pages (
  org_id uuid not null,
  day date not null,
  path text not null,
  views integer not null default 0,
  sessions integer not null default 0,
  entries integer not null default 0,
  definition_version smallint not null default 1,
  refreshed_at timestamptz not null,
  primary key (org_id, day, path)
);

create table public.analytics_daily_products (
  org_id uuid not null,
  day date not null,
  product_slug text not null,
  views integer not null default 0,
  sessions integer not null default 0,
  definition_version smallint not null default 1,
  refreshed_at timestamptz not null,
  primary key (org_id, day, product_slug)
);

create table public.analytics_job_state (
  org_id uuid not null,
  job text not null constraint analytics_job_state_job_check check (job in ('rollup')),
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_error text constraint analytics_job_state_error_check check (char_length(last_error) <= 300),
  last_result jsonb,
  primary key (org_id, job)
);

create index analytics_sessions_org_last_seen_idx on public.analytics_sessions (org_id, last_seen_at desc);

alter table public.analytics_daily_totals enable row level security;
alter table public.analytics_daily_sources enable row level security;
alter table public.analytics_daily_pages enable row level security;
alter table public.analytics_daily_products enable row level security;
alter table public.analytics_job_state enable row level security;
revoke all on public.analytics_daily_totals, public.analytics_daily_sources, public.analytics_daily_pages,
  public.analytics_daily_products, public.analytics_job_state from public, anon, authenticated, service_role;
grant select, insert, delete on public.analytics_daily_totals, public.analytics_daily_sources,
  public.analytics_daily_pages, public.analytics_daily_products to service_role;
grant select, insert, update on public.analytics_job_state to service_role;
-- Retention deletes only; visit pages/products/events go with their visit.
grant delete on public.analytics_events, public.analytics_sessions to service_role;

-- Rebuilds the summaries for a rolling window (at least the last 7 Dhaka days,
-- back to the day before the last success after missed runs, at most 31 days),
-- deletes expired raw data in bounded batches and records the run. Serialized
-- per workspace. Returns the window, deleted counts and whether more expired
-- rows remain.
create function public.run_analytics_maintenance(
  p_org_id uuid,
  p_now timestamptz,
  p_batch integer default 20000
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  today date := (p_now at time zone 'Asia/Dhaka')::date;
  last_ok timestamptz;
  from_day date;
  window_start timestamptz;
  window_end timestamptz;
  deleted_events integer;
  deleted_sessions integer;
  result jsonb;
begin
  if p_org_id is null or p_now is null or p_batch is null or p_batch < 1 or p_batch > 100000 then
    raise exception 'run_analytics_maintenance: invalid argument';
  end if;
  perform pg_advisory_xact_lock(hashtext('analytics_maintenance'), hashtext(p_org_id::text));

  select j.last_succeeded_at into last_ok from public.analytics_job_state j where j.org_id = p_org_id and j.job = 'rollup';
  from_day := greatest(today - 30, least(today - 6, coalesce((last_ok at time zone 'Asia/Dhaka')::date - 1, today - 30)));
  window_start := from_day::timestamp at time zone 'Asia/Dhaka';
  window_end := (today + 1)::timestamp at time zone 'Asia/Dhaka';

  delete from public.analytics_daily_totals where org_id = p_org_id and day between from_day and today;
  delete from public.analytics_daily_sources where org_id = p_org_id and day between from_day and today;
  delete from public.analytics_daily_pages where org_id = p_org_id and day between from_day and today;
  delete from public.analytics_daily_products where org_id = p_org_id and day between from_day and today;

  insert into public.analytics_daily_totals (org_id, day, sessions, visitors, new_visitors, pageviews, product_views, engaged_seconds,
    bounced_sessions, product_sessions, cart_sessions, checkout_sessions, ordered_sessions, orders, refreshed_at)
  select p_org_id, v.day, count(*), count(distinct v.visitor_id), count(*) filter (where v.is_new_visitor),
    sum(v.pageviews), sum(v.product_views), sum(v.engaged_seconds), count(*) filter (where v.pageviews <= 1),
    count(*) filter (where v.product_views > 0), count(*) filter (where v.cart_at is not null),
    count(*) filter (where v.checkout_at is not null), count(o.session_id), coalesce(sum(o.orders), 0), p_now
  from (
    select s.*, (s.started_at at time zone 'Asia/Dhaka')::date as day from public.analytics_sessions s
    where s.org_id = p_org_id and s.started_at >= window_start and s.started_at < window_end
  ) v
  left join (
    select f.session_id, count(*) as orders from public.analytics_order_facts f
    where f.org_id = p_org_id and f.submitted_at >= window_start group by f.session_id
  ) o on o.session_id = v.id
  group by v.day;

  insert into public.analytics_daily_sources (org_id, day, source, medium, sessions, visitors, ordered_sessions, orders, refreshed_at)
  select p_org_id, v.day, v.source, v.medium, count(*), count(distinct v.visitor_id), count(o.session_id), coalesce(sum(o.orders), 0), p_now
  from (
    select s.*, (s.started_at at time zone 'Asia/Dhaka')::date as day from public.analytics_sessions s
    where s.org_id = p_org_id and s.started_at >= window_start and s.started_at < window_end
  ) v
  left join (
    select f.session_id, count(*) as orders from public.analytics_order_facts f
    where f.org_id = p_org_id and f.submitted_at >= window_start group by f.session_id
  ) o on o.session_id = v.id
  group by v.day, v.source, v.medium;

  insert into public.analytics_daily_pages (org_id, day, path, views, sessions, entries, refreshed_at)
  select p_org_id, (s.started_at at time zone 'Asia/Dhaka')::date, p.path, sum(p.views), count(*), count(*) filter (where p.is_entry), p_now
  from public.analytics_session_pages p
  join public.analytics_sessions s on s.org_id = p.org_id and s.id = p.session_id
  where s.org_id = p_org_id and s.started_at >= window_start and s.started_at < window_end
  group by 2, p.path;

  insert into public.analytics_daily_products (org_id, day, product_slug, views, sessions, refreshed_at)
  select p_org_id, (s.started_at at time zone 'Asia/Dhaka')::date, p.product_slug, sum(p.views), count(*), p_now
  from public.analytics_session_products p
  join public.analytics_sessions s on s.org_id = p.org_id and s.id = p.session_id
  where s.org_id = p_org_id and s.started_at >= window_start and s.started_at < window_end
  group by 2, p.product_slug;

  delete from public.analytics_events e where e.id in (
    select x.id from public.analytics_events x
    where x.org_id = p_org_id and x.received_at < p_now - interval '90 days'
    order by x.id limit p_batch
  );
  get diagnostics deleted_events = row_count;

  delete from public.analytics_sessions s where s.id in (
    select x.id from public.analytics_sessions x
    where x.org_id = p_org_id and x.started_at < p_now - interval '25 months'
    order by x.started_at limit p_batch
  );
  get diagnostics deleted_sessions = row_count;

  result := jsonb_build_object(
    'from', from_day, 'to', today,
    'deleted_events', deleted_events, 'deleted_sessions', deleted_sessions,
    'more', deleted_events = p_batch or deleted_sessions = p_batch
  );
  insert into public.analytics_job_state (org_id, job, last_succeeded_at, last_result)
  values (p_org_id, 'rollup', p_now, result)
  on conflict (org_id, job) do update set last_succeeded_at = excluded.last_succeeded_at, last_result = excluded.last_result;
  return result;
end;
$$;

revoke all on function public.run_analytics_maintenance(uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.run_analytics_maintenance(uuid, timestamptz, integer) to service_role;

commit;
