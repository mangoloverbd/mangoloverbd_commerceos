begin;

alter table public.order_protection_events add column if not exists mode text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_protection_events'::regclass
      and conname = 'order_protection_events_mode_check'
  ) then
    alter table public.order_protection_events
      add constraint order_protection_events_mode_check check (mode in ('shadow', 'active'));
  end if;
end $$;

commit;
