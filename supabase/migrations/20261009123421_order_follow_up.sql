-- Follow up tab: who followed up on a parcel, when, and their note ("Customer
-- will receive tomorrow"). The parcel leaves Follow up for two days after a
-- follow-up unless the rider reports a new problem. Additive and data-preserving.
begin;

alter table public.orders
  add column if not exists followed_up_at timestamptz,
  add column if not exists followed_up_by uuid,
  add column if not exists follow_up_note text;

commit;
