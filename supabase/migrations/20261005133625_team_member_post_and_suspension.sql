begin;

-- A member's job title ("post") shown in Team Management.
alter table public.user_roles
  add column if not exists post text;

-- Temporarily switched-off members keep their role row, name and history but
-- lose API access until an admin switches them back on.
alter table public.user_roles
  add column if not exists suspended_at timestamptz;

commit;
