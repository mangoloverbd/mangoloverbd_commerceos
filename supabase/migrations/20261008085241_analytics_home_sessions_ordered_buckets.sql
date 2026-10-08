-- Home's conversion-rate sparkline and chart need ordered sessions per hour
-- and per day, not just sessions. Same function, two more bucket fields;
-- totals and every other key are unchanged.
begin;

create or replace function public.analytics_home_sessions(p_org_id uuid, p_since timestamptz, p_until timestamptz)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  result jsonb;
begin
  if p_org_id is null or p_since is null or p_until is null or p_until <= p_since or p_until - p_since > interval '367 days' then
    raise exception 'analytics_home_sessions: invalid range';
  end if;

  with v as (
    select s.started_at at time zone 'Asia/Dhaka' as local_at,
      -- Same order match as analytics_website_report's ordered_sessions.
      exists (
        select 1 from public.analytics_order_facts f
        join public.orders o on o.id = f.order_id and o.org_id = f.org_id
        where f.org_id = p_org_id and f.session_id = s.id
      ) as ordered
    from public.analytics_sessions s
    where s.org_id = p_org_id and s.started_at >= p_since and s.started_at < p_until
  )
  select jsonb_build_object(
    'totals', (select jsonb_build_object('sessions', count(*), 'ordered_sessions', count(*) filter (where v.ordered)) from v),
    'daily', coalesce((select jsonb_agg(d order by d.day) from (
      select v.local_at::date as day, count(*) as sessions, count(*) filter (where v.ordered) as ordered_sessions from v group by 1
    ) d), '[]'::jsonb),
    'hourly', coalesce((select jsonb_agg(h order by h.hour) from (
      select extract(hour from v.local_at)::int as hour, count(*) as sessions, count(*) filter (where v.ordered) as ordered_sessions from v group by 1
    ) h), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.analytics_home_sessions(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.analytics_home_sessions(uuid, timestamptz, timestamptz) to service_role;

commit;
