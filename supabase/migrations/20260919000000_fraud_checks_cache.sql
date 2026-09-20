-- Phone-keyed FraudShield result cache. One row per normalized BD mobile
-- number per workspace, holding the complete upstream response. Exists so
-- repeat customers and repeated order-editor opens never spend a request
-- against FraudShield's daily limit.

begin;

create table if not exists public.fraud_checks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  phone text not null check (phone ~ '^01[0-9]{9}$'),
  status text not null check (status in ('pending', 'ok', 'error')),
  payload jsonb check (payload is null or jsonb_typeof(payload) = 'object'),
  summary jsonb check (summary is null or jsonb_typeof(summary) = 'object'),
  error_message text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, phone)
);

create index if not exists fraud_checks_org_checked_at_idx
on public.fraud_checks (org_id, checked_at desc);

drop trigger if exists update_fraud_checks_updated_at on public.fraud_checks;
create trigger update_fraud_checks_updated_at
before update on public.fraud_checks
for each row execute function public.update_updated_at_column();

alter table public.fraud_checks enable row level security;
revoke all on public.fraud_checks from anon, authenticated;
grant all on public.fraud_checks to service_role;

commit;
