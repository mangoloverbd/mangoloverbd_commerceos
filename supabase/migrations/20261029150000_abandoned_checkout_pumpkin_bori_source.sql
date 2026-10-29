-- The storefront's /step/homemade-pumpkin-bori page now reports its own
-- abandoned-checkout source instead of reusing Kalojira Mixed. Replace the
-- (unnamed) source/path check with a named one that also allows it.
-- Additive and data-preserving: every existing row still satisfies the new check.
begin;

do $$
declare
  existing_name text;
begin
  for existing_name in
    select conname
    from pg_constraint
    where conrelid = 'public.abandoned_checkouts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%source_path%'
  loop
    execute format('alter table public.abandoned_checkouts drop constraint %I', existing_name);
  end loop;
end $$;

alter table public.abandoned_checkouts
  add constraint abandoned_checkouts_source_path_check check (
    (source = 'storefront' and source_path = '/checkout')
    or (source = 'sundarbans_honey' and source_path = '/step/sundarbans-natural-honey')
    or (source = 'kalojira_mixed' and source_path = '/step/kalojira-mixed')
    or (source = 'honey_nut' and source_path = '/step/honey-nut')
    or (source = 'homemade_pumpkin_bori' and source_path = '/step/homemade-pumpkin-bori')
  );

commit;
