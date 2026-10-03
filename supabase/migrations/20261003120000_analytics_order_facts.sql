-- First-party website analytics, Phase 2b (order ↔ visit linkage).
-- Additive only. One durable row per website order with attribution frozen at
-- submission; it never cascades from session retention.
-- Plan: docs/superpowers/plans/2026-10-03-analytics-page.md (Phase 2) and
-- docs/superpowers/plans/2026-10-02-first-party-analytics-revised.md §5, §7.
begin;

create table public.analytics_order_facts (
  order_id uuid primary key references public.orders (id) on delete cascade,
  org_id uuid not null,
  session_id uuid not null,                             -- visit that placed the order; no FK, sessions expire
  visitor_id uuid not null,
  submitted_at timestamptz not null,                    -- original submission, also for held orders
  model_version smallint not null default 1,
  -- Last non-direct visit in the 30-day lookback, else the ordering visit (direct).
  last_session_id uuid not null,
  last_at timestamptz not null,
  last_source text not null,
  last_medium text not null,
  last_utm_source text,
  last_utm_medium text,
  last_utm_campaign text,
  last_utm_content text,
  last_utm_term text,
  last_entry_path text not null,
  -- Earliest visit in the 30-day lookback.
  first_session_id uuid not null,
  first_at timestamptz not null,
  first_source text not null,
  first_medium text not null,
  first_utm_source text,
  first_utm_medium text,
  first_utm_campaign text,
  first_utm_content text,
  first_utm_term text,
  first_entry_path text not null,
  sessions_in_window integer not null constraint analytics_order_facts_sessions_check check (sessions_in_window > 0),
  recorded_at timestamptz not null default now()
);
create index analytics_order_facts_org_submitted_idx on public.analytics_order_facts (org_id, submitted_at desc);
create index analytics_order_facts_org_session_idx on public.analytics_order_facts (org_id, session_id);

-- Held orders remember the submitting visit until staff approve them.
alter table public.order_protection_reviews add column analytics_session_id uuid;

alter table public.analytics_order_facts enable row level security;
revoke all on public.analytics_order_facts from public, anon, authenticated, service_role;
grant select, insert on public.analytics_order_facts to service_role;

-- Freezes one order's attribution. The caller (Express, service role) supplies
-- the server-resolved workspace and the visit id forwarded by the storefront.
-- Returns 'recorded', 'duplicate', 'no_session' (unknown, stale or other
-- workspace's visit: the order stays unattributed) or 'rejected' (order is not
-- in this workspace).
create function public.record_analytics_order_fact(
  p_org_id uuid,
  p_order_id uuid,
  p_session_id uuid,
  p_submitted_at timestamptz
) returns text language plpgsql security invoker set search_path = '' as $$
declare
  ordering public.analytics_sessions%rowtype;
  first_touch public.analytics_sessions%rowtype;
  last_touch public.analytics_sessions%rowtype;
  window_count integer;
begin
  if p_org_id is null or p_order_id is null or p_session_id is null or p_submitted_at is null then
    raise exception 'record_analytics_order_fact: missing required argument';
  end if;
  if not exists (select 1 from public.orders o where o.id = p_order_id and o.org_id = p_org_id) then
    return 'rejected';
  end if;

  -- The ordering visit must belong to this workspace and be live at submission.
  select * into ordering from public.analytics_sessions s
  where s.id = p_session_id and s.org_id = p_org_id
    and s.started_at <= p_submitted_at
    and s.last_seen_at >= p_submitted_at - interval '35 minutes';
  if not found then
    return 'no_session';
  end if;

  select count(*) into window_count from public.analytics_sessions s
  where s.org_id = p_org_id and s.visitor_id = ordering.visitor_id
    and s.started_at between p_submitted_at - interval '30 days' and p_submitted_at;

  select * into first_touch from public.analytics_sessions s
  where s.org_id = p_org_id and s.visitor_id = ordering.visitor_id
    and s.started_at between p_submitted_at - interval '30 days' and p_submitted_at
  order by s.started_at, s.id limit 1;

  -- A direct revisit never replaces a still-valid non-direct visit.
  select * into last_touch from public.analytics_sessions s
  where s.org_id = p_org_id and s.visitor_id = ordering.visitor_id
    and s.started_at between p_submitted_at - interval '30 days' and p_submitted_at
    and s.source <> 'direct'
  order by s.started_at desc, s.id desc limit 1;
  if not found then
    last_touch := ordering;
  end if;

  insert into public.analytics_order_facts (
    order_id, org_id, session_id, visitor_id, submitted_at,
    last_session_id, last_at, last_source, last_medium, last_utm_source, last_utm_medium, last_utm_campaign, last_utm_content, last_utm_term, last_entry_path,
    first_session_id, first_at, first_source, first_medium, first_utm_source, first_utm_medium, first_utm_campaign, first_utm_content, first_utm_term, first_entry_path,
    sessions_in_window
  ) values (
    p_order_id, p_org_id, ordering.id, ordering.visitor_id, p_submitted_at,
    last_touch.id, last_touch.started_at, last_touch.source, last_touch.medium, last_touch.utm_source, last_touch.utm_medium,
    last_touch.utm_campaign, last_touch.utm_content, last_touch.utm_term, last_touch.entry_path,
    first_touch.id, first_touch.started_at, first_touch.source, first_touch.medium, first_touch.utm_source, first_touch.utm_medium,
    first_touch.utm_campaign, first_touch.utm_content, first_touch.utm_term, first_touch.entry_path,
    window_count
  )
  on conflict (order_id) do nothing;
  return case when found then 'recorded' else 'duplicate' end;
end;
$$;

revoke all on function public.record_analytics_order_fact(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.record_analytics_order_fact(uuid, uuid, uuid, timestamptz) to service_role;

commit;
