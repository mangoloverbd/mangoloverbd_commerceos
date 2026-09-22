-- Activity Log: extend the existing order_status_events audit trail to also
-- cover abandoned_checkouts, so "who marked this cart Contacted/Dismissed"
-- is answerable the same way "who confirmed/cancelled this order" already is.
--
-- No new columns are added to abandoned_checkouts. Its human actions become
-- rows in order_status_events, exactly like orders and social_inbox_orders.

begin;

alter table public.order_status_events
  drop constraint if exists order_status_events_order_table_check;

alter table public.order_status_events
  add constraint order_status_events_order_table_check
  check (order_table in ('orders', 'social_inbox_orders', 'abandoned_checkouts'));

commit;
