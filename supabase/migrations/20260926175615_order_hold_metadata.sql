-- Keep staff hold metadata separate from customer-facing order notes.
alter table public.orders
  add column if not exists hold_reason_code text,
  add column if not exists hold_reason_detail text,
  add column if not exists hold_until_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_hold_metadata_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_hold_metadata_check
      check (
        (
          hold_reason_code is null
          and hold_reason_detail is null
          and hold_until_date is null
        )
        or (
          hold_reason_code is not null
          and hold_reason_code in (
            'customer_requested_after_date',
            'contact_later',
            'awaiting_customer_confirmation',
            'contact_details_change',
            'order_change_requested',
            'payment_confirmation_pending',
            'advance_payment_pending',
            'temporarily_out_of_stock',
            'courier_delivery_issue',
            'other'
          )
          and (
            (hold_reason_code = 'customer_requested_after_date' and hold_until_date is not null)
            or (hold_reason_code <> 'customer_requested_after_date' and hold_until_date is null)
          )
          and (hold_reason_code = 'other' or hold_reason_detail is null)
        )
      );
  end if;
end;
$$;

create index if not exists orders_org_on_hold_until_date_idx
  on public.orders (org_id, hold_until_date)
  where status in ('on_hold', 'hold') and hold_until_date is not null;
