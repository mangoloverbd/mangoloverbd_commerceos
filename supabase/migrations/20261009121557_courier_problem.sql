-- Follow up: delivery problems the rider reported ("Delivery attempt failed",
-- "Rider Note: …"), kept apart from the latest courier note so a later routine
-- tracking step does not hide the problem. Additive and data-preserving.
--
-- The progress stamp now keeps a courier_status_at supplied with the change
-- (the time the parcel really moved, from Steadfast's tracking history) and
-- stamps now() only when none is given.
begin;

alter table public.orders
  add column if not exists courier_problem text,
  add column if not exists courier_problem_at timestamptz;

create or replace function public.stamp_order_progress()
returns trigger language plpgsql set search_path = '' as $$
begin
  if lower(btrim(coalesce(new.status, ''))) = 'processing'
    and (tg_op = 'INSERT' or lower(btrim(coalesce(old.status, ''))) <> 'processing') then
    new.processing_at := now();
  end if;
  if tg_op = 'INSERT' then
    if new.courier_status is not null and new.courier_status_at is null then
      new.courier_status_at := now();
    end if;
  elsif new.courier_status is distinct from old.courier_status
    and new.courier_status_at is not distinct from old.courier_status_at then
    new.courier_status_at := now();
  end if;
  return new;
end;
$$;

commit;
