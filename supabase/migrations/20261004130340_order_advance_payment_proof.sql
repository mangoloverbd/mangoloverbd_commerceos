-- Record proof that an advance / partial payment was received: the wallet or
-- bank it came through and a TrxID or the sender's last 4 digits. Both are
-- optional and only meaningful while advanced_payment > 0; the API clears them
-- when the advance is removed.
begin;
alter table public.orders
  add column advance_payment_method text,
  add column advance_payment_reference text;

alter table public.orders
  add constraint orders_advance_payment_method_check
    check (advance_payment_method is null or advance_payment_method in ('bkash', 'nagad', 'rocket', 'bank')),
  add constraint orders_advance_payment_reference_check
    check (advance_payment_reference is null or char_length(advance_payment_reference) between 4 and 40);

comment on column public.orders.advance_payment_method is
  'Where the advance was paid: bkash, nagad, rocket or bank. Null when unknown or no advance.';
comment on column public.orders.advance_payment_reference is
  'TrxID or sender last 4 digits proving the advance was received. Null when not recorded.';
commit;
