-- The Orders page's Stuck tab: when an order entered Processing, when its
-- courier status last changed, and the courier's latest note (for example
-- "Customer not reachable"). Additive and data-preserving.
--
-- processing_at and courier_status_at are stamped by a trigger, so every code
-- path that changes an order is covered. Current orders are backfilled from
-- their recorded history; orders without history stay unknown and are never
-- shown as stuck. Re-running is safe.
begin;

alter table public.orders
  add column if not exists processing_at timestamptz,
  add column if not exists courier_status_at timestamptz,
  add column if not exists courier_note text,
  add column if not exists courier_note_at timestamptz;

create or replace function public.stamp_order_progress()
returns trigger language plpgsql set search_path = '' as $$
begin
  if lower(btrim(coalesce(new.status, ''))) = 'processing'
    and (tg_op = 'INSERT' or lower(btrim(coalesce(old.status, ''))) <> 'processing') then
    new.processing_at := now();
  end if;
  if tg_op = 'INSERT' then
    if new.courier_status is not null then
      new.courier_status_at := now();
    end if;
  elsif new.courier_status is distinct from old.courier_status then
    new.courier_status_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_order_progress on public.orders;
create trigger stamp_order_progress
  before insert or update of status, courier_status on public.orders
  for each row execute function public.stamp_order_progress();

-- Backfill from history: the latest move into Processing, and the latest
-- courier status change.
update public.orders o set processing_at = e.at
from (
  select order_id, max(created_at) as at from public.order_status_events
  where order_table = 'orders' and to_status = 'processing' group by order_id
) e
where o.id = e.order_id and o.processing_at is null and lower(btrim(coalesce(o.status, ''))) = 'processing';

update public.orders o set courier_status_at = e.at
from (
  select order_id, max(created_at) as at from public.order_activity_events
  where order_table = 'orders' and event_type = 'courier.status_changed' group by order_id
) e
where o.id = e.order_id and o.courier_status_at is null and o.courier_status is not null;

commit;
