-- Live visitor presence ("on the site now") shared by every server instance.
-- Presence lived in per-instance memory because Upstash Redis is not used, so
-- each Vercel instance counted only the shoppers that happened to ping it.
-- Additive only. Unlogged: rows are seconds-lived and need no WAL or recovery.
begin;

create unlogged table public.live_visitor_presence (
  org_id uuid not null,
  session_id text not null check (char_length(session_id) between 1 and 128),
  bucket text not null check (bucket in ('all', 'cart', 'checkout', 'purchased')),
  last_seen_at timestamptz not null,
  primary key (org_id, bucket, session_id)
);

alter table public.live_visitor_presence enable row level security;
-- No browser policies; only the server (service role) reads or writes presence.
revoke all on public.live_visitor_presence from public, anon, authenticated;
grant select, insert, update, delete on public.live_visitor_presence to service_role;

-- Marks a visit as present in 'all' and, optionally, in one funnel bucket.
create or replace function public.touch_live_visitor(p_org_id uuid, p_session_id text, p_bucket text)
returns void language sql security invoker set search_path = '' as $$
  insert into public.live_visitor_presence (org_id, session_id, bucket, last_seen_at)
  select p_org_id, p_session_id, b, now()
  from unnest(array['all', p_bucket]) as b
  where b is not null
  on conflict (org_id, bucket, session_id) do update set last_seen_at = excluded.last_seen_at;
$$;

-- Counts visits seen in the window per bucket, then clears rows long past it.
create or replace function public.count_live_visitors(p_org_id uuid, p_window_seconds integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  counts jsonb;
begin
  select coalesce(jsonb_object_agg(bucket, n), '{}'::jsonb) into counts
  from (
    select bucket, count(*) as n
    from public.live_visitor_presence
    where org_id = p_org_id and last_seen_at > now() - make_interval(secs => p_window_seconds)
    group by bucket
  ) live;
  delete from public.live_visitor_presence where last_seen_at < now() - interval '10 minutes';
  return counts;
end;
$$;

revoke all on function public.touch_live_visitor(uuid, text, text) from public, anon, authenticated;
revoke all on function public.count_live_visitors(uuid, integer) from public, anon, authenticated;
grant execute on function public.touch_live_visitor(uuid, text, text) to service_role;
grant execute on function public.count_live_visitors(uuid, integer) to service_role;

commit;
