create table if not exists public.ai_action_log (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  user_id         uuid not null,
  call_id         text not null,
  tool            text not null,
  args            jsonb not null,
  before_snapshot jsonb,
  after_snapshot  jsonb,
  applied_at      timestamptz not null default now()
);
create index if not exists ai_action_log_org_applied_idx
  on public.ai_action_log (org_id, applied_at desc);
alter table public.ai_action_log enable row level security;
